import AVKit
import SwiftUI

/// A mutable, per-row editing model so SwiftUI can bind sliders/toggles. Edits
/// are persisted back through simple-arg Convex mutations.
struct EditClip: Identifiable, Equatable {
    let id: String
    let isVideo: Bool
    let thumbURL: URL?
    var durationMs: Double
    var kenBurns: Bool
}

struct VideoEditorView: View {
    let projectId: String
    @EnvironmentObject var auth: AuthStore

    @State private var project: VideoProject?
    @State private var editClips: [EditClip] = []
    @State private var renders: [VideoRender] = []
    @State private var loading = true
    @State private var error: String?
    @State private var showAdd = false
    @State private var exporting = false
    @State private var pollTask: Task<Void, Never>?

    // Local settings.
    @State private var templateId = "slideshow"
    @State private var resolutionId = "1080x1920"
    @State private var fps = 30

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if let error {
                ContentUnavailableView(
                    "Couldn't load", systemImage: "film",
                    description: Text(error))
            } else {
                List {
                    previewSection
                    settingsSection
                    clipsSection
                    exportSection
                }
            }
        }
        .navigationTitle(project?.name ?? "Video")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
        .task { await load() }
        .onDisappear { pollTask?.cancel() }
        .sheet(isPresented: $showAdd) {
            AddClipsSheet(projectId: projectId, shootId: project?.shootId) {
                await load()
            }
        }
    }

    // MARK: Sections

    private var previewSection: some View {
        Section {
            if let render = latestSucceeded, let url = render.outputURL {
                VideoPlayer(player: AVPlayer(url: url))
                    .frame(height: 240)
                    .listRowInsets(EdgeInsets())
            }
            if editClips.isEmpty {
                Text("Add clips to start your video.")
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(editClips) { clip in
                            AsyncImage(url: clip.thumbURL) { phase in
                                if let img = phase.image {
                                    img.resizable().scaledToFill()
                                } else {
                                    Rectangle().fill(.quaternary)
                                }
                            }
                            .frame(width: 54, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var settingsSection: some View {
        Section("Settings") {
            menuPicker(
                title: "Template",
                value: templateName(templateId),
                options: videoTemplates.map { ($0.id, "\($0.emoji)  \($0.name)") }
            ) { id in
                templateId = id
                persistSettings(templateId: id)
            }
            menuPicker(
                title: "Resolution",
                value: resolutionLabel(resolutionId),
                options: videoResolutions.map { ($0.id, $0.label) }
            ) { id in
                resolutionId = id
                if let r = videoResolutions.first(where: { $0.id == id }) {
                    persistSettings(width: r.width, height: r.height)
                }
            }
            menuPicker(
                title: "Frame rate",
                value: "\(fps) fps",
                options: videoFpsOptions.map { (String($0), "\($0) fps") }
            ) { id in
                if let f = Int(id) {
                    fps = f
                    persistSettings(fps: f)
                }
            }
        }
    }

    private var clipsSection: some View {
        Section("Clips") {
            if editClips.isEmpty {
                Button {
                    showAdd = true
                } label: {
                    Label("Add clips", systemImage: "plus")
                }
            }
            ForEach($editClips) { $clip in
                ClipRow(clip: $clip) {
                    persistDuration(clip)
                } onKenBurnsChange: {
                    persistKenBurns(clip)
                }
            }
            .onMove(perform: moveClips)
            .onDelete(perform: deleteClips)
        }
    }

    private var exportSection: some View {
        Section("Export") {
            Button {
                export()
            } label: {
                HStack {
                    if exporting {
                        ProgressView()
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                    Text("Export mp4")
                }
            }
            .disabled(exporting || editClips.isEmpty)

            if let render = renders.first {
                renderStatus(render)
            }
        }
    }

    @ViewBuilder
    private func renderStatus(_ render: VideoRender) -> some View {
        switch render.status {
        case "succeeded":
            if let url = render.outputURL {
                ShareLink(item: url) {
                    Label("Share / save mp4", systemImage: "square.and.arrow.up")
                }
            }
        case "failed":
            Text(render.error ?? "Render failed")
                .font(.footnote)
                .foregroundStyle(.red)
        default:
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: render.progress ?? 0.05)
                Text(render.progressLabel ?? "Rendering…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Helpers

    private var latestSucceeded: VideoRender? {
        renders.first { $0.status == "succeeded" && $0.outputUrl != nil }
    }

    private func menuPicker(
        title: String, value: String, options: [(String, String)],
        onPick: @escaping (String) -> Void
    ) -> some View {
        Menu {
            ForEach(options, id: \.0) { opt in
                Button(opt.1) { onPick(opt.0) }
            }
        } label: {
            HStack {
                Text(title)
                Spacer()
                Text(value).foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .tint(.primary)
    }

    private func templateName(_ id: String) -> String {
        videoTemplates.first { $0.id == id }.map { "\($0.emoji)  \($0.name)" }
            ?? id
    }
    private func resolutionLabel(_ id: String) -> String {
        videoResolutions.first { $0.id == id }?.label ?? id
    }

    // MARK: Data

    private func load() async {
        do {
            let p = try await client().getVideoProject(projectId)
            project = p
            templateId = p.templateId
            resolutionId = "\(p.width)x\(p.height)"
            fps = p.fps
            editClips = p.clips.map {
                EditClip(
                    id: $0.id, isVideo: $0.isVideo, thumbURL: $0.thumbURL,
                    durationMs: $0.durationMs, kenBurns: $0.kenBurns)
            }
            renders = (try? await client().listRenders(projectId: projectId)) ?? []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func moveClips(from: IndexSet, to: Int) {
        editClips.move(fromOffsets: from, toOffset: to)
        let ids = editClips.map(\.id)
        Task { try? await client().reorderClips(projectId: projectId, clipIds: ids) }
    }

    private func deleteClips(_ offsets: IndexSet) {
        let ids = offsets.map { editClips[$0].id }
        editClips.remove(atOffsets: offsets)
        Task {
            for id in ids {
                try? await client().removeClip(projectId: projectId, clipId: id)
            }
        }
    }

    private func persistDuration(_ clip: EditClip) {
        Task {
            try? await client().setClipDuration(
                projectId: projectId, clipId: clip.id, durationMs: clip.durationMs)
        }
    }

    private func persistKenBurns(_ clip: EditClip) {
        Task {
            try? await client().setClipKenBurns(
                projectId: projectId, clipId: clip.id, enabled: clip.kenBurns)
        }
    }

    private func persistSettings(
        templateId: String? = nil, width: Int? = nil, height: Int? = nil,
        fps: Int? = nil
    ) {
        Task {
            try? await client().updateVideoSettings(
                projectId: projectId, templateId: templateId,
                width: width, height: height, fps: fps)
        }
    }

    private func export() {
        Task {
            exporting = true
            do {
                _ = try await client().startRender(projectId: projectId)
            } catch {
                self.error = error.localizedDescription
            }
            exporting = false
            startPolling()
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            for _ in 0..<160 {  // ~8 min at 3s
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                let latest =
                    (try? await client().listRenders(projectId: projectId)) ?? []
                await MainActor.run { renders = latest }
                if let s = latest.first?.status,
                    s == "succeeded" || s == "failed"
                {
                    return
                }
            }
        }
    }
}

/// One editable clip row: thumbnail, duration slider, Ken Burns toggle.
private struct ClipRow: View {
    @Binding var clip: EditClip
    let onDurationCommit: () -> Void
    let onKenBurnsChange: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            AsyncImage(url: clip.thumbURL) { phase in
                if let img = phase.image {
                    img.resizable().scaledToFill()
                } else {
                    Rectangle().fill(.quaternary)
                }
            }
            .frame(width: 40, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 5))

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(
                        systemName: clip.isVideo ? "play.rectangle" : "photo"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    Spacer()
                    Text(formatDuration(clip.durationMs))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: $clip.durationMs, in: 300...10000, step: 100,
                    onEditingChanged: { editing in
                        if !editing { onDurationCommit() }
                    })
                if !clip.isVideo {
                    Toggle("Ken Burns", isOn: $clip.kenBurns)
                        .font(.caption)
                        .onChange(of: clip.kenBurns) { _, _ in
                            onKenBurnsChange()
                        }
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// Pick finished images to append to the timeline.
private struct AddClipsSheet: View {
    let projectId: String
    let shootId: String?
    let onAdded: () async -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var images: [VideoSourceImage] = []
    @State private var picked: Set<String> = []
    @State private var loading = true
    @State private var adding = false

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 8)]

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView()
                } else if filtered.isEmpty {
                    ContentUnavailableView(
                        "No images", systemImage: "photo.on.rectangle")
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(filtered) { img in
                                tile(img)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Add clips")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add \(picked.count)") { add() }
                        .disabled(picked.isEmpty || adding)
                }
            }
            .task { await load() }
        }
    }

    private var filtered: [VideoSourceImage] {
        guard let shootId else { return images }
        return images.filter { $0.shootId == shootId }
    }

    private func tile(_ img: VideoSourceImage) -> some View {
        let on = picked.contains(img.id)
        return AsyncImage(url: img.thumbURL) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .frame(height: 130)
        .frame(maxWidth: .infinity)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .topTrailing) {
            if on {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.white, Color.accentColor)
                    .padding(4)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(on ? Color.accentColor : .clear, lineWidth: 2)
        }
        .onTapGesture {
            if on { picked.remove(img.id) } else { picked.insert(img.id) }
        }
    }

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    private func load() async {
        images = (try? await client().listSourceImages()) ?? []
        loading = false
    }

    private func add() {
        Task {
            adding = true
            try? await client().addGenerations(
                projectId: projectId, generationIds: Array(picked))
            await onAdded()
            adding = false
            dismiss()
        }
    }
}
