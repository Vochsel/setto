import PhotosUI
import SwiftUI
import UIKit

/// An optional AI pass that composites the model (in their product) into a
/// captured photo, run in the background after the photo is saved.
enum EnhanceModel: String, CaseIterable, Identifiable {
    case off = ""
    case nanoBanana = "google/gemini-2.5-flash-image"
    case gptImage2 = "openai/gpt-image-2"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .off: return "Off"
        case .nanoBanana: return "Nano Banana"
        case .gptImage2: return "GPT Image 2"
        }
    }
}

/// "Photo mode": pick a location within a shoot, the model and product the photo
/// is of, then capture (or upload) a real photo. It's saved into the shoot's
/// image outputs (overriding that location's AI shots) via
/// `generations:addCapture`, then — optionally — handed to an image model to
/// composite the model wearing their product into the scene.
struct PhotoCaptureView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let shoot: Shoot
    var onSaved: () -> Void

    @State private var locations: [ShootLocationDoc] = []
    @State private var models: [ModelDoc] = []
    @State private var outfits: [OutfitDoc] = []

    @State private var locationId: String?
    @State private var modelId: String?
    @State private var outfitId: String?
    @State private var enhance: EnhanceModel = .off
    @State private var pickerItem: PhotosPickerItem?

    @State private var loading = true
    @State private var showCamera = false
    @State private var saving = false
    @State private var error: String?

    private var selectedModel: ModelDoc? { models.first { $0.id == modelId } }
    private var selectedOutfit: OutfitDoc? { outfits.first { $0.id == outfitId } }
    private var references: [URL] {
        [selectedModel?.thumbURL, selectedOutfit?.thumbURL].compactMap { $0 }
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView()
                } else if locations.isEmpty {
                    ContentUnavailableView(
                        "No locations in this shoot",
                        systemImage: "mappin.slash",
                        description: Text(
                            "Add a location to the shoot first, then capture photos for it."
                        ))
                } else {
                    form
                }
            }
            .navigationTitle("Photo Mode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
            .fullScreenCover(isPresented: $showCamera) {
                CameraView(
                    references: references,
                    onCapture: { image in
                        showCamera = false
                        save(image)
                    },
                    onCancel: { showCamera = false }
                )
            }
        }
    }

    private var form: some View {
        Form {
            Section("Location") {
                Picker("Location", selection: $locationId) {
                    ForEach(locations) { loc in
                        Text(loc.name).tag(loc.id as String?)
                    }
                }
                .onChange(of: locationId) { _, _ in defaultModelForLocation() }
            }

            Section("Model") {
                Picker("Model", selection: $modelId) {
                    Text("None").tag(String?.none)
                    ForEach(models) { model in
                        Text(model.name ?? "Untitled").tag(model.id as String?)
                    }
                }
            }

            Section("Product") {
                Picker("Product", selection: $outfitId) {
                    Text("None").tag(String?.none)
                    ForEach(outfits) { outfit in
                        Text(outfit.name).tag(outfit.id as String?)
                    }
                }
            }

            if !references.isEmpty {
                Section("Reference") {
                    HStack(spacing: 12) {
                        ForEach(references, id: \.self) { url in
                            AsyncImage(url: url) { phase in
                                if let image = phase.image {
                                    image.resizable().scaledToFill()
                                } else {
                                    Color.gray.opacity(0.15)
                                }
                            }
                            .frame(width: 60, height: 78)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            }

            Section {
                Picker("AI wardrobe pass", selection: $enhance) {
                    ForEach(EnhanceModel.allCases) { m in
                        Text(m.label).tag(m)
                    }
                }
            } header: {
                Text("Enhance")
            } footer: {
                Text(
                    enhance == .off
                        ? "Save the photo as-is."
                        : "After saving, \(enhance.label) composites the model — wearing the product — into the photo, in the background."
                )
            }

            if let error {
                Section {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }

            Section {
                Button {
                    showCamera = true
                } label: {
                    if saving {
                        HStack {
                            ProgressView()
                            Text("Saving…")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Label("Open Camera", systemImage: "camera.fill")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(saving || locationId == nil)

                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Upload from Camera Roll", systemImage: "photo.on.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .disabled(saving || locationId == nil)
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                    let image = UIImage(data: data)
                {
                    save(image)
                }
                pickerItem = nil
            }
        }
    }

    /// Default the model picker to a model present at the chosen location.
    private func defaultModelForLocation() {
        guard let loc = locations.first(where: { $0.id == locationId }) else {
            return
        }
        if let present = loc.models.first?.id {
            modelId = present
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = ConvexClient(
                baseURL: Config.convexURL, token: auth.validToken())
            async let locs = client.call(
                "shootLocations:listByShoot", .query,
                args: ["shootId": shoot.id], as: [ShootLocationDoc].self)
            async let mods = client.call(
                "models:list", .query, as: [ModelDoc].self)
            async let outs = client.call(
                "outfits:list", .query, as: [OutfitDoc].self)
            locations = try await locs
            models = try await mods
            outfits = try await outs
            locationId = locations.first?.id
            defaultModelForLocation()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.9) else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                let client = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                let storageId = try await client.uploadImage(data)
                let captureId = try await client.addCapture(
                    storageId: storageId,
                    shootLocationId: locationId,
                    modelId: modelId,
                    outfitId: outfitId)
                // Kick off the optional AI wardrobe pass (best-effort — the real
                // photo is already saved either way).
                if enhance != .off {
                    try? await client.enhanceCapture(
                        captureId: captureId, modelKey: enhance.rawValue)
                }
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
