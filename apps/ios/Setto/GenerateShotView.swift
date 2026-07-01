import SwiftUI

/// Generate new shot images from the library — the phone version of the web
/// shot generator. Pick a location, model, product (outfit) and an image model,
/// optionally add a pose/extra prompt, and generate one or more images. Creates
/// a shot (`shots:create`), sets its recipe (`shots:update`) and runs
/// `generate:generateShot` — the exact same pipeline as the website.
struct GenerateShotView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let shoot: Shoot
    var onGenerating: () -> Void

    @State private var locations: [ShootLocationDoc] = []
    @State private var models: [ModelDoc] = []
    @State private var outfits: [OutfitDoc] = []

    @State private var locationId: String?
    @State private var modelId: String?
    @State private var outfitId: String?
    @State private var imageModelId = defaultImageGenModelId
    @State private var aspect = "auto"
    @State private var count = 1
    @State private var posePrompt = ""
    @State private var extraPrompt = ""

    @State private var loading = true
    @State private var generating = false
    @State private var error: String?

    private let aspects: [(String, String)] = [
        ("auto", "Auto"), ("4:5", "4:5 portrait"), ("9:16", "9:16 vertical"),
        ("1:1", "1:1 square"), ("16:9", "16:9 landscape"),
    ]

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
                            "Add a location to the shoot first, then generate shots for it."
                        ))
                } else {
                    form
                }
            }
            .navigationTitle("Generate Shot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task { await load() }
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

            Section("Prompt") {
                TextField("Pose (optional)", text: $posePrompt, axis: .vertical)
                    .lineLimit(1...3)
                TextField("Extra details (optional)", text: $extraPrompt, axis: .vertical)
                    .lineLimit(1...3)
            }

            Section("Output") {
                Picker("AI model", selection: $imageModelId) {
                    ForEach(imageGenModels) { m in
                        Text(m.label).tag(m.id)
                    }
                }
                Picker("Aspect ratio", selection: $aspect) {
                    ForEach(aspects, id: \.0) { Text($0.1).tag($0.0) }
                }
                Stepper("Images: \(count)", value: $count, in: 1...4)
            }

            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                Button(action: generate) {
                    if generating {
                        HStack {
                            ProgressView()
                            Text("Generating…")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Label("Generate", systemImage: "sparkles")
                            .frame(maxWidth: .infinity)
                    }
                }
                .disabled(generating || locationId == nil)
            } footer: {
                Text(
                    "Generates \(count) image\(count == 1 ? "" : "s") into this shoot using \(imageModelLabel). No photo needed."
                )
            }
        }
    }

    private var imageModelLabel: String {
        imageGenModels.first { $0.id == imageModelId }?.label ?? "the AI model"
    }

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    private func defaultModelForLocation() {
        guard let loc = locations.first(where: { $0.id == locationId }) else {
            return
        }
        if modelId == nil, let present = loc.models.first?.id {
            modelId = present
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let c = client()
            async let locs = c.call(
                "shootLocations:listByShoot", .query,
                args: ["shootId": shoot.id], as: [ShootLocationDoc].self)
            async let mods = c.call("models:list", .query, as: [ModelDoc].self)
            async let outs = c.call("outfits:list", .query, as: [OutfitDoc].self)
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

    private func generate() {
        guard let locationId else { return }
        generating = true
        error = nil
        Task {
            defer { generating = false }
            do {
                let c = client()
                let shotId = try await c.createShot(
                    shootLocationId: locationId, name: nil, modelId: modelId)
                try await c.updateShot(
                    id: shotId,
                    outfitId: outfitId,
                    posePrompt: posePrompt,
                    extraPrompt: extraPrompt,
                    aspectRatio: aspect == "auto" ? nil : aspect)
                for _ in 0..<count {
                    _ = try await c.generateShot(
                        shotId: shotId, modelKey: imageModelId)
                }
                onGenerating()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
