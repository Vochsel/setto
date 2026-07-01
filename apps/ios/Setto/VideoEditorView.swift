import AVKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// A mutable, per-row editing model so SwiftUI can bind sliders/toggles. Edits
/// are persisted back through simple-arg Convex mutations.
struct EditClip: Identifiable, Equatable {
    let id: String
    let isVideo: Bool
    let thumbURL: URL?
    var durationMs: Double
    // Ken Burns (images).
    var kenBurns: Bool
    var kbDirection: String  // "in" | "out"
    var kbFocusX: Double
    var kbFocusY: Double
    var kbZoom: Double
    // Incoming transition.
    var transitionType: String
    var transitionMs: Double
}

/// Identifiable ref so a tapped clip can drive `.sheet(item:)`.
struct ClipEditRef: Identifiable { let id: String }

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
    @State private var editing: ClipEditRef?

    // Local settings.
    @State private var templateId = "slideshow"
    @State private var resolutionId = "1080x1920"
    @State private var fps = 30
    @State private var stackStaggerMs: Double = 700
    @State private var stackAnimate = true
    @State private var background: String?
    @State private var backgroundGradient: String?
    @State private var backgroundImageUrl: String?

    // Audio.
    @State private var audioTracks: [AudioTrackDoc] = []
    @State private var audioTrackId: String?
    @State private var showAudioImporter = false
    @State private var uploadingAudio = false

    // Background image upload.
    @State private var bgPickerItem: PhotosPickerItem?

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
                    if templateId == "stack" { stackSection }
                    backgroundSection
                    audioSection
                    clipsSection
                    exportSection
                }
            }
        }
        .navigationTitle(project?.name ?? "Video")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
            }
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
        .task { await load() }
        .onDisappear { pollTask?.cancel() }
        .sheet(isPresented: $showAdd) {
            AddClipsSheet(projectId: projectId, shootId: project?.shootId) {
                await load()
            }
            .environmentObject(auth)
        }
        .sheet(item: $editing) { ref in
            if let idx = editClips.firstIndex(where: { $0.id == ref.id }) {
                ClipDetailSheet(
                    clip: $editClips[idx], projectId: projectId,
                    templateId: templateId, index: idx
                )
                .environmentObject(auth)
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

    private var stackSection: some View {
        Section("Photo stack") {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Time between photos")
                    Spacer()
                    Text(String(format: "%.2fs", stackStaggerMs / 1000))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: $stackStaggerMs, in: 150...2500, step: 50,
                    onEditingChanged: { if !$0 { persistStack() } })
            }
            Toggle("Animate photos in", isOn: $stackAnimate)
                .onChange(of: stackAnimate) { _, _ in persistStack() }
        }
    }

    private var backgroundSection: some View {
        Section("Background") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(backgroundColors, id: \.self) { hex in
                        Circle()
                            .fill(Color(hex: hex))
                            .frame(width: 26, height: 26)
                            .overlay(
                                Circle().stroke(.gray.opacity(0.4), lineWidth: 1))
                            .overlay(selectionRing(isSolidSelected(hex)))
                            .onTapGesture { applyBackground(color: hex) }
                    }
                }
                .padding(.vertical, 2)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(gradientPresets) { g in
                        RoundedRectangle(cornerRadius: 6)
                            .fill(gradientFill(g))
                            .frame(width: 46, height: 28)
                            .overlay(selectionRing(backgroundGradient == g.css))
                            .onTapGesture { applyBackground(gradient: g.css) }
                    }
                }
                .padding(.vertical, 2)
            }
            if let img = backgroundImageUrl, let url = URL(string: img) {
                HStack {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            Rectangle().fill(.quaternary)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    Text("Background image").font(.subheadline)
                    Spacer()
                    Button(role: .destructive) {
                        applyBackground(color: background ?? "#000000")
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                }
            }
            PhotosPicker(selection: $bgPickerItem, matching: .images) {
                Label("Background image", systemImage: "photo")
            }
        }
        .onChange(of: bgPickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await uploadBackgroundImage(data)
                }
                bgPickerItem = nil
            }
        }
    }

    private var audioSection: some View {
        Section("Audio") {
            Picker("Track", selection: $audioTrackId) {
                Text("No audio").tag(String?.none)
                ForEach(audioTracks) { t in
                    Text(t.name).tag(t.id as String?)
                }
            }
            .onChange(of: audioTrackId) { _, newValue in pickAudio(newValue) }

            Button {
                showAudioImporter = true
            } label: {
                if uploadingAudio {
                    HStack { ProgressView(); Text("Uploading…") }
                } else {
                    Label("Upload song", systemImage: "music.note")
                }
            }
            .disabled(uploadingAudio)
        }
        .fileImporter(
            isPresented: $showAudioImporter,
            allowedContentTypes: [.audio], allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                Task { await importAudio(url) }
            }
        }
    }

    private var clipsSection: some View {
        Section("Clips") {
            if editClips.isEmpty {
                Button { showAdd = true } label: {
                    Label("Add clips", systemImage: "plus")
                }
            }
            ForEach($editClips) { $clip in
                ClipRow(clip: $clip) {
                    persistDuration(clip)
                } onKenBurnsChange: {
                    persistKenBurns(clip)
                } onAdjust: {
                    editing = ClipEditRef(id: clip.id)
                }
            }
            .onMove(perform: moveClips)
            .onDelete(perform: deleteClips)
        }
    }

    private var exportSection: some View {
        Section("Export") {
            Button { export() } label: {
                HStack {
                    if exporting { ProgressView() } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                    Text("Export mp4")
                }
            }
            .disabled(exporting || editClips.isEmpty)

            if let render = renders.first { renderStatus(render) }
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
                .font(.footnote).foregroundStyle(.red)
        default:
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: render.progress ?? 0.05)
                Text(render.progressLabel ?? "Rendering…")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Helpers

    private var latestSucceeded: VideoRender? {
        renders.first { $0.status == "succeeded" && $0.outputUrl != nil }
    }

    private func isSolidSelected(_ hex: String) -> Bool {
        backgroundGradient == nil && backgroundImageUrl == nil
            && background == hex
    }

    @ViewBuilder
    private func selectionRing(_ on: Bool) -> some View {
        if on {
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.accentColor, lineWidth: 2.5)
        }
    }

    private func gradientFill(_ g: GradientPreset) -> LinearGradient {
        LinearGradient(
            colors: g.colors.map { Color(rgb: $0) },
            startPoint: .topLeading, endPoint: .bottomTrailing)
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
                    .font(.caption2).foregroundStyle(.tertiary)
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
            stackStaggerMs = p.stackStaggerMs ?? 700
            stackAnimate = p.stackAnimate ?? true
            background = p.background
            backgroundGradient = p.backgroundGradient
            backgroundImageUrl = p.backgroundImageUrl
            audioTrackId = p.audio?.trackId
            editClips = p.clips.map { clip in
                let kb = clip.effect?.controls
                    ?? KenBurnsControls(
                        direction: "in", focusX: 0, focusY: 0, zoom: 1.18)
                return EditClip(
                    id: clip.id, isVideo: clip.isVideo, thumbURL: clip.thumbURL,
                    durationMs: clip.durationMs, kenBurns: clip.kenBurns,
                    kbDirection: kb.direction, kbFocusX: kb.focusX,
                    kbFocusY: kb.focusY, kbZoom: kb.zoom,
                    transitionType: clip.transition?.type ?? "none",
                    transitionMs: clip.transition?.durationMs ?? 400)
            }
            renders = (try? await client().listRenders(projectId: projectId)) ?? []
            audioTracks = (try? await client().listAudioTracks()) ?? []
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
            if clip.kenBurns {
                try? await client().setClipKenBurnsControls(
                    projectId: projectId, clipId: clip.id,
                    direction: clip.kbDirection, focusX: clip.kbFocusX,
                    focusY: clip.kbFocusY, zoom: clip.kbZoom)
            } else {
                try? await client().setClipKenBurns(
                    projectId: projectId, clipId: clip.id, enabled: false)
            }
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

    private func persistStack() {
        Task {
            try? await client().setStackSettings(
                projectId: projectId, staggerMs: Int(stackStaggerMs),
                animate: stackAnimate)
        }
    }

    private func applyBackground(
        color: String? = nil, gradient: String? = nil, imageUrl: String? = nil
    ) {
        background = color
        backgroundGradient = gradient
        backgroundImageUrl = imageUrl
        Task {
            try? await client().setProjectBackground(
                projectId: projectId, color: color, gradient: gradient,
                imageUrl: imageUrl)
        }
    }

    private func uploadBackgroundImage(_ data: Data) async {
        do {
            let c = client()
            let storageId = try await c.uploadImage(data)
            if let url = try await c.fileURL(storageId: storageId) {
                applyBackground(imageUrl: url)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pickAudio(_ trackId: String?) {
        Task {
            guard let trackId else {
                try? await client().clearProjectAudio(projectId: projectId)
                return
            }
            guard let t = audioTracks.first(where: { $0.id == trackId }),
                let url = t.url
            else { return }
            try? await client().setProjectAudio(
                projectId: projectId, url: url, name: t.name, trackId: t.id)
        }
    }

    private func importAudio(_ url: URL) async {
        uploadingAudio = true
        defer { uploadingAudio = false }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let c = client()
            let type = audioContentType(for: url)
            let storageId = try await c.uploadImage(data, contentType: type)
            let track = try await c.createAudioTrack(
                storageId: storageId, name: url.deletingPathExtension().lastPathComponent)
            audioTracks.insert(track, at: 0)
            audioTrackId = track.id
            if let trackUrl = track.url {
                try await c.setProjectAudio(
                    projectId: projectId, url: trackUrl, name: track.name,
                    trackId: track.id)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func audioContentType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "wav": return "audio/wav"
        case "m4a", "aac": return "audio/mp4"
        case "aiff", "aif": return "audio/aiff"
        default: return "audio/mpeg"
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

/// One editable clip row: thumbnail, duration slider, Ken Burns toggle, and an
/// "adjust" button that opens the full per-clip inspector.
private struct ClipRow: View {
    @Binding var clip: EditClip
    let onDurationCommit: () -> Void
    let onKenBurnsChange: () -> Void
    let onAdjust: () -> Void

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
                    Image(systemName: clip.isVideo ? "play.rectangle" : "photo")
                        .font(.caption).foregroundStyle(.secondary)
                    if !clip.isVideo, clip.transitionType != "none" {
                        Image(systemName: "arrow.triangle.merge")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(formatDuration(clip.durationMs))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Slider(
                    value: $clip.durationMs, in: 300...10000, step: 100,
                    onEditingChanged: { if !$0 { onDurationCommit() } })
                if !clip.isVideo {
                    Toggle("Ken Burns", isOn: $clip.kenBurns)
                        .font(.caption)
                        .onChange(of: clip.kenBurns) { _, _ in onKenBurnsChange() }
                }
            }

            Button(action: onAdjust) {
                Image(systemName: "slider.horizontal.3")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 2)
    }
}

/// Full per-clip inspector: duration, incoming transition, and Ken Burns
/// direction / focal point / zoom.
private struct ClipDetailSheet: View {
    @Binding var clip: EditClip
    let projectId: String
    let templateId: String
    let index: Int

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    private var isSequence: Bool { templateId != "stack" }

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Duration") {
                    HStack {
                        Text("Length")
                        Spacer()
                        Text(formatDuration(clip.durationMs))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    Slider(
                        value: $clip.durationMs, in: 300...10000, step: 100,
                        onEditingChanged: { if !$0 { persistDuration() } })
                }

                if isSequence && index > 0 {
                    Section("Transition in") {
                        Picker("Type", selection: $clip.transitionType) {
                            ForEach(transitionOptions) { t in
                                Text(t.label).tag(t.id)
                            }
                        }
                        .onChange(of: clip.transitionType) { _, _ in
                            persistTransition()
                        }
                        if clip.transitionType != "none" {
                            HStack {
                                Text("Length")
                                Spacer()
                                Text(String(format: "%.2fs", clip.transitionMs / 1000))
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            Slider(
                                value: $clip.transitionMs, in: 150...2000, step: 50,
                                onEditingChanged: { if !$0 { persistTransition() } })
                        }
                    }
                }

                if !clip.isVideo && isSequence {
                    Section("Motion (Ken Burns)") {
                        Toggle("Ken Burns", isOn: $clip.kenBurns)
                            .onChange(of: clip.kenBurns) { _, _ in persistKenBurns() }
                        if clip.kenBurns {
                            Picker("Direction", selection: $clip.kbDirection) {
                                Text("Zoom in").tag("in")
                                Text("Zoom out").tag("out")
                            }
                            .pickerStyle(.segmented)
                            .onChange(of: clip.kbDirection) { _, _ in persistKenBurns() }

                            HStack {
                                Text("Zoom")
                                Spacer()
                                Text("\(Int(clip.kbZoom * 100))%")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            Slider(
                                value: $clip.kbZoom, in: 1.02...1.6,
                                onEditingChanged: { if !$0 { persistKenBurns() } })

                            VStack(alignment: .leading, spacing: 6) {
                                Text("Focal point")
                                    .font(.caption).foregroundStyle(.secondary)
                                FocalPad(
                                    thumbURL: clip.thumbURL,
                                    x: $clip.kbFocusX, y: $clip.kbFocusY,
                                    onCommit: { persistKenBurns() })
                            }
                        }
                    }
                }
            }
            .navigationTitle("Clip \(index + 1)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func persistDuration() {
        Task {
            try? await client().setClipDuration(
                projectId: projectId, clipId: clip.id, durationMs: clip.durationMs)
        }
    }

    private func persistTransition() {
        Task {
            try? await client().setClipTransition(
                projectId: projectId, clipId: clip.id, type: clip.transitionType,
                durationMs: clip.transitionMs)
        }
    }

    private func persistKenBurns() {
        Task {
            if clip.kenBurns {
                try? await client().setClipKenBurnsControls(
                    projectId: projectId, clipId: clip.id,
                    direction: clip.kbDirection, focusX: clip.kbFocusX,
                    focusY: clip.kbFocusY, zoom: clip.kbZoom)
            } else {
                try? await client().setClipKenBurns(
                    projectId: projectId, clipId: clip.id, enabled: false)
            }
        }
    }
}

/// A draggable focal-point pad over the clip thumbnail (normalized [-1,1]).
private struct FocalPad: View {
    let thumbURL: URL?
    @Binding var x: Double
    @Binding var y: Double
    let onCommit: () -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                AsyncImage(url: thumbURL) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFill()
                    } else {
                        Rectangle().fill(.quaternary)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()

                Circle()
                    .strokeBorder(.white, lineWidth: 2)
                    .background(Circle().fill(.black.opacity(0.25)))
                    .frame(width: 22, height: 22)
                    .position(
                        x: (x + 1) / 2 * geo.size.width,
                        y: (y + 1) / 2 * geo.size.height)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        x = min(1, max(-1, Double(v.location.x / geo.size.width) * 2 - 1))
                        y = min(1, max(-1, Double(v.location.y / geo.size.height) * 2 - 1))
                    }
                    .onEnded { _ in onCommit() }
            )
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .frame(maxWidth: 150)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// Pick finished images or motion clips to append to the timeline, filterable by
/// shoot / model / wardrobe / favorites (mirrors the web add-clips dialog).
private struct AddClipsSheet: View {
    let projectId: String
    let shootId: String?
    let onAdded: () async -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var images: [VideoSourceImage] = []
    @State private var videos: [VideoSourceVideo] = []
    @State private var models: [ModelDoc] = []
    @State private var outfits: [OutfitDoc] = []
    @State private var shoots: [Shoot] = []

    @State private var tab = 0  // 0 = images, 1 = motion clips
    @State private var pickedImages: Set<String> = []
    @State private var pickedVideos: Set<String> = []

    // Filters
    @State private var shootFilter: String = "all"
    @State private var modelFilter = "all"
    @State private var wardrobeFilter = "all"
    @State private var favOnly = false

    @State private var loading = true
    @State private var adding = false

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 8)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Kind", selection: $tab) {
                    Text("Images").tag(0)
                    Text("Motion clips").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 6)

                filters

                if loading {
                    Spacer(); ProgressView(); Spacer()
                } else {
                    grid
                }
            }
            .navigationTitle("Add clips")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add \(pickedCount)") { add() }
                        .disabled(pickedCount == 0 || adding)
                }
            }
            .task { await load() }
        }
    }

    private var pickedCount: Int { pickedImages.count + pickedVideos.count }

    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterMenu(
                    title: "Shoot", selection: $shootFilter,
                    options: [("all", "All shoots")]
                        + shoots.map { ($0.id, $0.name) })
                filterMenu(
                    title: "Model", selection: $modelFilter,
                    options: [("all", "All models")]
                        + models.map { ($0.id, $0.name ?? "Untitled") })
                if tab == 0 {
                    filterMenu(
                        title: "Wardrobe", selection: $wardrobeFilter,
                        options: [("all", "All wardrobe")]
                            + outfits.map { ($0.id, $0.name) })
                }
                Button {
                    favOnly.toggle()
                } label: {
                    Label("Favorites", systemImage: favOnly ? "heart.fill" : "heart")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .tint(favOnly ? .red : .secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private func filterMenu(
        title: String, selection: Binding<String>, options: [(String, String)]
    ) -> some View {
        Menu {
            ForEach(options, id: \.0) { opt in
                Button(opt.1) { selection.wrappedValue = opt.0 }
            }
        } label: {
            HStack(spacing: 3) {
                Text(options.first { $0.0 == selection.wrappedValue }?.1 ?? title)
                    .lineLimit(1)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.quaternary, in: Capsule())
        }
        .tint(.primary)
    }

    private var grid: some View {
        ScrollView {
            if tab == 0 {
                if filteredImages.isEmpty {
                    empty("No images match these filters")
                } else {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(filteredImages) { img in
                            tile(
                                url: img.thumbURL,
                                on: pickedImages.contains(img.id),
                                fav: img.favorite ?? false
                            ) { toggle(&pickedImages, img.id) }
                        }
                    }
                    .padding()
                }
            } else {
                if wardrobeFilter != "all" {
                    empty("Wardrobe filtering isn't available for motion clips.")
                } else if filteredVideos.isEmpty {
                    empty("No motion clips match these filters")
                } else {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(filteredVideos) { v in
                            tile(
                                url: v.thumbURL,
                                on: pickedVideos.contains(v.id),
                                fav: v.favorite ?? false, isVideo: true
                            ) { toggle(&pickedVideos, v.id) }
                        }
                    }
                    .padding()
                }
            }
        }
    }

    private func empty(_ text: String) -> some View {
        ContentUnavailableView(
            "Nothing here", systemImage: "photo.on.rectangle",
            description: Text(text))
    }

    private var filteredImages: [VideoSourceImage] {
        images.filter { g in
            g.imageUrl != nil
                && (shootFilter == "all" || g.shootId == shootFilter)
                && (modelFilter == "all" || g.modelId == modelFilter)
                && (wardrobeFilter == "all" || g.outfitId == wardrobeFilter)
                && (!favOnly || (g.favorite ?? false))
        }
    }

    private var filteredVideos: [VideoSourceVideo] {
        videos.filter { v in
            v.videoUrl != nil
                && (shootFilter == "all" || v.shootId == shootFilter)
                && (modelFilter == "all" || v.modelId == modelFilter)
                && (!favOnly || (v.favorite ?? false))
        }
    }

    private func tile(
        url: URL?, on: Bool, fav: Bool, isVideo: Bool = false,
        toggle: @escaping () -> Void
    ) -> some View {
        AsyncImage(url: url) { phase in
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
        .overlay(alignment: .topLeading) {
            if fav {
                Image(systemName: "heart.fill")
                    .font(.caption2).foregroundStyle(.red)
                    .padding(5)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if isVideo {
                Image(systemName: "play.fill")
                    .font(.caption2).foregroundStyle(.white)
                    .padding(5)
            }
        }
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
        .onTapGesture { toggle() }
    }

    private func toggle(_ set: inout Set<String>, _ id: String) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    private func load() async {
        let c = client()
        async let imgs = try? c.listSourceImages()
        async let vids = try? c.listSourceVideos()
        async let mods = try? c.call("models:list", .query, as: [ModelDoc].self)
        async let outs = try? c.call("outfits:list", .query, as: [OutfitDoc].self)
        async let shs = try? c.call("shoots:list", .query, as: [Shoot].self)
        images = await imgs ?? []
        videos = await vids ?? []
        models = await mods ?? []
        outfits = await outs ?? []
        shoots = await shs ?? []
        if let shootId { shootFilter = shootId }
        loading = false
    }

    private func add() {
        Task {
            adding = true
            let c = client()
            if !pickedImages.isEmpty {
                try? await c.addGenerations(
                    projectId: projectId, generationIds: Array(pickedImages))
            }
            if !pickedVideos.isEmpty {
                try? await c.addVideos(
                    projectId: projectId, videoIds: Array(pickedVideos))
            }
            await onAdded()
            adding = false
            dismiss()
        }
    }
}

// MARK: - Color helpers

extension Color {
    /// Build a Color from a "#rrggbb" hex string.
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        self.init(rgb: UInt32(value & 0xFFFFFF))
    }

    /// Build a Color from a 0xRRGGBB integer.
    init(rgb: UInt32) {
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255)
    }
}
