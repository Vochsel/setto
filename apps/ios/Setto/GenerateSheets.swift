import SwiftUI

/// Animate a finished image into a short video (image-to-video), mirroring the
/// web lightbox "Animate" action. Runs `videos:generate`; the render appears in
/// the gallery / shoot when it finishes.
struct AnimateSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let generationId: String

    @State private var prompt = "Subtle, natural motion — keep it realistic."
    @State private var modelId = defaultVideoGenModelId
    @State private var duration = 5
    @State private var busy = false
    @State private var error: String?
    @State private var started = false

    private var model: VideoGenModel? {
        videoGenModels.first { $0.id == modelId }
    }

    var body: some View {
        NavigationStack {
            Form {
                if started {
                    Section {
                        Label(
                            "Animating… it'll appear in your gallery shortly.",
                            systemImage: "checkmark.circle.fill"
                        )
                        .foregroundStyle(.green)
                    }
                } else {
                    Section("Motion prompt") {
                        TextField("Describe the motion", text: $prompt, axis: .vertical)
                            .lineLimit(2...5)
                    }
                    Section("Model") {
                        Picker("Model", selection: $modelId) {
                            ForEach(videoGenModels) { m in
                                Text(m.label).tag(m.id)
                            }
                        }
                        .onChange(of: modelId) { _, _ in
                            if let m = model, !m.durations.contains(duration) {
                                duration = m.defaultDuration
                            }
                        }
                        Picker("Duration", selection: $duration) {
                            ForEach(model?.durations ?? [5], id: \.self) { d in
                                Text("\(d)s").tag(d)
                            }
                        }
                    }
                    if let error {
                        Section { Text(error).foregroundStyle(.red).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Animate")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(started ? "Done" : "Cancel") { dismiss() }
                }
                if !started {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(action: go) {
                            if busy { ProgressView() } else { Text("Animate") }
                        }
                        .disabled(busy || prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    private func go() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let c = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                _ = try await c.generateVideo(
                    generationId: generationId, prompt: prompt,
                    modelKey: modelId, durationSeconds: duration)
                started = true
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Generate 1–4 realistic variations of a finished image (image-to-image),
/// mirroring the web "Make variations" action. Runs `generate:generateVariations`.
struct VariationsSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let generationId: String

    @State private var count = 3
    @State private var prompt = ""
    @State private var modelId = defaultVariationGenModelId
    @State private var busy = false
    @State private var error: String?
    @State private var started = false

    var body: some View {
        NavigationStack {
            Form {
                if started {
                    Section {
                        Label(
                            "Generating variations… they'll appear alongside the original.",
                            systemImage: "checkmark.circle.fill"
                        )
                        .foregroundStyle(.green)
                    }
                } else {
                    Section("How many") {
                        Stepper("\(count) variation\(count == 1 ? "" : "s")", value: $count, in: 1...4)
                    }
                    Section("Change (optional)") {
                        TextField("e.g. different pose, warmer light", text: $prompt, axis: .vertical)
                            .lineLimit(1...4)
                    }
                    Section("Model") {
                        Picker("Model", selection: $modelId) {
                            ForEach(variationGenModels) { m in
                                Text("\(m.label) · \(formatModelPrice(m.price))")
                                    .tag(m.id)
                            }
                        }
                    }
                    if let error {
                        Section { Text(error).foregroundStyle(.red).font(.footnote) }
                    }
                }
            }
            .navigationTitle("Variations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(started ? "Done" : "Cancel") { dismiss() }
                }
                if !started {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(action: go) {
                            if busy { ProgressView() } else { Text("Generate") }
                        }
                        .disabled(busy)
                    }
                }
            }
        }
    }

    private func go() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let c = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                _ = try await c.generateVariations(
                    generationId: generationId, prompt: prompt,
                    modelKey: modelId, count: count)
                started = true
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
