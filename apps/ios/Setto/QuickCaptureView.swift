import PhotosUI
import SwiftUI
import UIKit

/// The library entity a quick capture is anchored to (the page it's launched
/// from). It's pre-tagged; the other two entity types are selectable.
enum QuickCaptureAnchor {
    case location(id: String, name: String)
    case outfit(id: String, name: String)
    case model(id: String, name: String)

    var id: String {
        switch self {
        case .location(let id, _), .outfit(let id, _), .model(let id, _): return id
        }
    }
    var name: String {
        switch self {
        case .location(_, let n), .outfit(_, let n), .model(_, let n): return n
        }
    }
    var kindLabel: String {
        switch self {
        case .location: return "location"
        case .outfit: return "product"
        case .model: return "model"
        }
    }
    var isLocation: Bool { if case .location = self { return true } else { return false } }
    var isOutfit: Bool { if case .outfit = self { return true } else { return false } }
    var isModel: Bool { if case .model = self { return true } else { return false } }
}

/// Quick-capture sheet: generate a photo tagged straight to a location,
/// product or model — with no shoot. Two modes: "Prompt" (text → generate) and
/// "Capture" (snap/upload a real scene photo → composite). Mirrors the web
/// QuickCaptureModal; calls `generate:generateQuick`.
struct QuickCaptureView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let anchor: QuickCaptureAnchor
    var onStarted: () -> Void = {}

    @State private var mode = "prompt"  // "prompt" | "capture"
    @State private var models: [ModelDoc] = []
    @State private var outfits: [OutfitDoc] = []
    @State private var locations: [LocationDoc] = []

    @State private var modelSel: String?
    @State private var outfitSel: String?
    @State private var locationSel: String?
    @State private var imageModelId = defaultImageGenModelId
    @State private var aspect = "4:5"
    @State private var count = 1
    @State private var posePrompt = ""
    @State private var extraPrompt = ""

    @State private var loading = true
    @State private var busy = false
    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var error: String?
    @State private var started = false

    private let aspects: [(String, String)] = [
        ("4:5", "Portrait 4:5"), ("1:1", "Square 1:1"), ("3:4", "Portrait 3:4"),
        ("2:3", "Portrait 2:3"), ("9:16", "Tall 9:16"), ("16:9", "Wide 16:9"),
    ]

    private var effLocationId: String? { anchor.isLocation ? anchor.id : locationSel }
    private var effOutfitId: String? { anchor.isOutfit ? anchor.id : outfitSel }
    private var effModelId: String? { anchor.isModel ? anchor.id : modelSel }

    private var references: [URL] {
        [
            models.first { $0.id == effModelId }?.thumbURL,
            outfits.first { $0.id == effOutfitId }?.thumbURL,
        ].compactMap { $0 }
    }
    private var estCost: Double {
        (imageGenModels.first { $0.id == imageModelId }?.price ?? 0) * Double(count)
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView()
                } else if started {
                    doneView
                } else {
                    form
                }
            }
            .navigationTitle("Quick capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(started ? "Done" : "Cancel") { dismiss() }
                }
            }
            .task { await load() }
            .fullScreenCover(isPresented: $showCamera) {
                CameraView(
                    references: references,
                    onCapture: { image in
                        showCamera = false
                        saveCapture(image)
                    },
                    onCancel: { showCamera = false }
                )
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                        let image = UIImage(data: data)
                    {
                        saveCapture(image)
                    }
                    pickerItem = nil
                }
            }
        }
    }

    private var doneView: some View {
        ContentUnavailableView {
            Label("Generating…", systemImage: "checkmark.circle.fill")
        } description: {
            Text("It'll appear in this \(anchor.kindLabel)'s photos shortly.")
        }
    }

    private var form: some View {
        Form {
            Section {
                Picker("Mode", selection: $mode) {
                    Text("Prompt").tag("prompt")
                    Text("Capture").tag("capture")
                }
                .pickerStyle(.segmented)
            } footer: {
                Label("Tagged to this \(anchor.kindLabel): \(anchor.name)",
                    systemImage: "tag")
            }

            Section("Tags") {
                if !anchor.isModel {
                    Picker("Model", selection: $modelSel) {
                        Text("None").tag(String?.none)
                        ForEach(models) { m in
                            Text(m.name ?? "Untitled").tag(m.id as String?)
                        }
                    }
                }
                if !anchor.isOutfit {
                    Picker("Product", selection: $outfitSel) {
                        Text("None").tag(String?.none)
                        ForEach(outfits) { o in
                            Text(o.name).tag(o.id as String?)
                        }
                    }
                }
                if !anchor.isLocation {
                    Picker("Location", selection: $locationSel) {
                        Text("None").tag(String?.none)
                        ForEach(locations) { l in
                            Text(l.name).tag(l.id as String?)
                        }
                    }
                }
            }

            Section("Output") {
                Picker("AI model", selection: $imageModelId) {
                    ForEach(imageGenModels) { m in
                        Text("\(m.label) · \(formatModelPrice(m.price))").tag(m.id)
                    }
                }
                Picker("Aspect ratio", selection: $aspect) {
                    ForEach(aspects, id: \.0) { Text($0.1).tag($0.0) }
                }
                if mode == "prompt" {
                    Stepper("Images: \(count)", value: $count, in: 1...4)
                    LabeledContent("Est. cost") {
                        Text("~\(formatModelPrice(estCost))")
                            .foregroundStyle(.secondary).monospacedDigit()
                    }
                }
            }

            if mode == "prompt" {
                Section("Direction (optional)") {
                    TextField("Pose / action", text: $posePrompt, axis: .vertical)
                        .lineLimit(1...3)
                    TextField("Extra details", text: $extraPrompt, axis: .vertical)
                        .lineLimit(1...3)
                }
            } else if !references.isEmpty {
                Section("Reference") {
                    HStack(spacing: 12) {
                        ForEach(references, id: \.self) { url in
                            CachedAsyncImage(url: url) { phase in
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

            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                if mode == "prompt" {
                    Button(action: runPrompt) {
                        actionLabel("Generate", systemImage: "sparkles")
                    }
                    .disabled(busy)
                } else {
                    Button { showCamera = true } label: {
                        actionLabel("Open Camera", systemImage: "camera.fill")
                    }
                    .disabled(busy)
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Upload from Camera Roll", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(busy)
                }
            } footer: {
                if mode == "capture" {
                    Text(
                        "Your photo is the scene — the model in their product is composited into it. The photo itself isn't stored."
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func actionLabel(_ title: String, systemImage: String) -> some View {
        if busy {
            HStack { ProgressView(); Text("Generating…") }
                .frame(maxWidth: .infinity)
        } else {
            Label(title, systemImage: systemImage).frame(maxWidth: .infinity)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let c = auth.client()
            if !anchor.isModel {
                models = try await c.call("models:list", .query, as: [ModelDoc].self)
            }
            if !anchor.isOutfit {
                outfits = try await c.call("outfits:list", .query, as: [OutfitDoc].self)
            }
            if !anchor.isLocation {
                locations = try await c.locations()
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func runPrompt() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let c = auth.client()
                _ = try await c.generateQuick(
                    mode: "prompt", locationId: effLocationId,
                    outfitId: effOutfitId, modelId: effModelId,
                    modelKey: imageModelId, aspectRatio: aspect, count: count,
                    posePrompt: posePrompt, extraPrompt: extraPrompt)
                started = true
                onStarted()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func saveCapture(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.9) else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let c = auth.client()
                let storageId = try await c.uploadImage(data)
                _ = try await c.generateQuick(
                    mode: "capture", locationId: effLocationId,
                    outfitId: effOutfitId, modelId: effModelId,
                    modelKey: imageModelId, aspectRatio: aspect,
                    captureStorageId: storageId)
                started = true
                onStarted()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
