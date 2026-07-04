import SwiftUI

/// Browse shoots. Each opens a detail screen with its media (swipeable
/// TikTok-style) and a camera entry point for Photo Mode.
struct ShootsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var shoots: [Shoot] = []
    @State private var error: String?
    @State private var loading = false
    @State private var showNewShoot = false
    @State private var newShootName = ""
    @State private var createdShoot: Shoot?

    var body: some View {
        NavigationStack {
            Group {
                if loading && shoots.isEmpty {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView(
                        "Couldn't load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error))
                } else if shoots.isEmpty {
                    ContentUnavailableView {
                        Label("No shoots yet", systemImage: "camera.on.rectangle")
                    } description: {
                        Text("Create a shoot to start capturing and generating.")
                    } actions: {
                        Button("New shoot") { showNewShoot = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List(shoots) { shoot in
                        NavigationLink {
                            ShootDetailView(shoot: shoot)
                                .environmentObject(auth)
                        } label: {
                            ShootRow(shoot: shoot)
                        }
                    }
                }
            }
            .navigationTitle("Shoots")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNewShoot = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(item: $createdShoot) { shoot in
                ShootDetailView(shoot: shoot).environmentObject(auth)
            }
            .refreshable { await load() }
            .task { await load() }
            .alert("New shoot", isPresented: $showNewShoot) {
                TextField("Name", text: $newShootName)
                Button("Create") { Task { await createShoot() } }
                Button("Cancel", role: .cancel) { newShootName = "" }
            } message: {
                Text("Give your shoot a name.")
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            shoots = try await client.call(
                "shoots:list", .query, as: [Shoot].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func createShoot() async {
        let name = newShootName.trimmingCharacters(in: .whitespaces)
        newShootName = ""
        guard !name.isEmpty else { return }
        do {
            let id = try await auth.client().createShoot(name: name)
            await load()
            // Jump straight into the new shoot to add locations / generate.
            createdShoot = Shoot(
                id: id, name: name, status: "draft", description: nil,
                locationCount: 0, shotCount: 0, recentImages: nil)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A shoot list row: cover thumbnail, name, status pill, and counts.
private struct ShootRow: View {
    let shoot: Shoot

    var body: some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: shoot.coverURL) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Color.gray.opacity(0.15)
                        .overlay(
                            Image(systemName: "camera")
                                .foregroundStyle(.secondary))
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(shoot.name).font(.headline)
                HStack(spacing: 6) {
                    Text(shoot.status.capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                    Text(
                        "\(shoot.locationCount ?? 0) locations · \(shoot.shotCount ?? 0) shots"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// A shoot's media (images + video) as a grid, swipeable into the full-screen
/// reel, plus a Camera button that opens Photo Mode for this shoot.
struct ShootDetailView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let shoot: Shoot

    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    @State private var swipeStart: SwipeAnchor?
    @State private var showCamera = false
    @State private var showGenerate = false
    @State private var headerHidden = false
    @State private var newVideoId: String?
    @State private var creatingVideo = false
    /// In-flight / failed image generations for this shoot (live progress).
    @State private var pending: [GenerationRow] = []
    @State private var polling = false

    @ViewBuilder private var mainContent: some View {
        if loading && items.isEmpty && pending.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error {
            ContentUnavailableView(
                "Couldn't load",
                systemImage: "exclamationmark.triangle",
                description: Text(error))
        } else if items.isEmpty {
            if pending.isEmpty {
                ContentUnavailableView(
                    "No photos yet",
                    systemImage: "photo.on.rectangle",
                    description: Text(
                        "Tap the camera to add the first photo to this shoot."))
            } else {
                // Generations are in flight but nothing has landed yet — the
                // strip above carries the state; keep the space open.
                Color.clear
            }
        } else {
            AutoHidingScroll(headerHidden: $headerHidden) {
                MasonryGrid(items: items) { item in
                    swipeStart = SwipeAnchor(id: item.id)
                }
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if !pending.isEmpty { PendingStrip(rows: pending) }
            mainContent
        }
        // Floating actions stay put as the header hides (Photo Mode + Play).
        .overlay(alignment: .bottomTrailing) {
            VStack(spacing: 14) {
                if !items.isEmpty {
                    FloatingButton(
                        systemImage: "play.fill", tint: .black.opacity(0.6),
                        size: 48
                    ) {
                        if let first = items.first {
                            swipeStart = SwipeAnchor(id: first.id)
                        }
                    }
                }
                FloatingButton(
                    systemImage: "sparkles", tint: .black.opacity(0.6), size: 48
                ) {
                    showGenerate = true
                }
                .accessibilityLabel("Generate Shot")
                FloatingButton(systemImage: "camera.fill", size: 60) {
                    showCamera = true
                }
                .accessibilityLabel("Photo Mode")
            }
            .padding(20)
        }
        // A floating back button while the nav header is hidden on scroll.
        .overlay(alignment: .topLeading) {
            if headerHidden {
                FloatingButton(
                    systemImage: "chevron.left", tint: .black.opacity(0.5),
                    size: 40
                ) { dismiss() }
                .padding(.leading, 16)
                .padding(.top, 4)
                .transition(.opacity)
            }
        }
        .navigationTitle(shoot.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(headerHidden ? .hidden : .visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: makeVideo) {
                    if creatingVideo {
                        ProgressView()
                    } else {
                        Label("Make video", systemImage: "film")
                    }
                }
                .disabled(creatingVideo)
            }
        }
        .navigationDestination(item: $newVideoId) { id in
            VideoEditorView(projectId: id)
        }
        .refreshable { await load(); await refreshGenerations() }
        .task {
            await load()
            await refreshGenerations()
            await pollUntilSettled()
        }
        .fullScreenCover(item: $swipeStart) { anchor in
            SwipeFeedView(items: $items, startId: anchor.id)
                .environmentObject(auth)
        }
        .sheet(isPresented: $showCamera) {
            PhotoCaptureView(shoot: shoot) {
                Task { await afterGenerate() }
            }
            .environmentObject(auth)
        }
        .sheet(isPresented: $showGenerate) {
            GenerateShotView(shoot: shoot) {
                Task { await afterGenerate() }
            }
            .environmentObject(auth)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            items = try await client.call(
                "review:feed", .query,
                args: ["shootId": shoot.id], as: [MediaItem].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Fetch every generation for this shoot and keep only the ones still
    /// working (or failed) as `pending`. Returns the succeeded count so the
    /// poller can tell when a fresh image has landed.
    @discardableResult
    private func refreshGenerations() async -> Int {
        do {
            let rows = try await auth.client().call(
                "generations:listByShoot", .query,
                args: ["shootId": shoot.id], as: [GenerationRow].self)
            pending = rows.filter { $0.status != "succeeded" }
            return rows.filter { $0.status == "succeeded" }.count
        } catch {
            return -1
        }
    }

    /// Poll while anything is generating, pulling finished images into the grid
    /// as they land. Cancelled automatically when the view goes away (`.task`).
    private func pollUntilSettled() async {
        guard !polling, !pending.isEmpty else { return }
        polling = true
        defer { polling = false }
        var lastSucceeded = await refreshGenerations()  // baseline now
        while !pending.isEmpty {
            try? await Task.sleep(for: .seconds(2.5))
            if Task.isCancelled { return }
            let succeeded = await refreshGenerations()
            if succeeded > lastSucceeded {
                await load()  // a new image finished — reveal it in the grid
                lastSucceeded = succeeded
            }
        }
        // Everything settled — one final reconcile.
        await load()
    }

    /// After kicking off a generation (or capture): show the new in-flight
    /// tiles immediately, then poll until they finish.
    private func afterGenerate() async {
        await refreshGenerations()
        await pollUntilSettled()
    }

    /// Start a new video project scoped to this shoot, then push the editor.
    private func makeVideo() {
        Task {
            creatingVideo = true
            defer { creatingVideo = false }
            do {
                let client = auth.client()
                newVideoId = try await client.createVideoProject(
                    shootId: shoot.id)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
