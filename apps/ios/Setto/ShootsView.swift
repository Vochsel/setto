import SwiftUI

/// Browse shoots. Each opens a detail screen with its media (swipeable
/// TikTok-style) and a camera entry point for Photo Mode.
struct ShootsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var shoots: [Shoot] = []
    @State private var error: String?
    @State private var loading = false

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
                    ContentUnavailableView(
                        "No shoots yet", systemImage: "camera.on.rectangle")
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
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = ConvexClient(
                baseURL: Config.convexURL, token: auth.validToken())
            shoots = try await client.call(
                "shoots:list", .query, as: [Shoot].self)
            error = nil
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
            AsyncImage(url: shoot.coverURL) { phase in
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
    @State private var headerHidden = false

    var body: some View {
        Group {
            if loading && items.isEmpty {
                ProgressView()
            } else if let error {
                ContentUnavailableView(
                    "Couldn't load",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error))
            } else if items.isEmpty {
                ContentUnavailableView(
                    "No photos yet",
                    systemImage: "photo.on.rectangle",
                    description: Text(
                        "Tap the camera to add the first photo to this shoot."))
            } else {
                AutoHidingScroll(headerHidden: $headerHidden) {
                    MasonryGrid(items: items) { item in
                        swipeStart = SwipeAnchor(id: item.id)
                    }
                }
            }
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
        .refreshable { await load() }
        .task { await load() }
        .fullScreenCover(item: $swipeStart) { anchor in
            SwipeFeedView(items: $items, startId: anchor.id)
                .environmentObject(auth)
        }
        .sheet(isPresented: $showCamera) {
            PhotoCaptureView(shoot: shoot) {
                Task { await load() }
            }
            .environmentObject(auth)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = ConvexClient(
                baseURL: Config.convexURL, token: auth.validToken())
            items = try await client.call(
                "review:feed", .query,
                args: ["shootId": shoot.id], as: [MediaItem].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
