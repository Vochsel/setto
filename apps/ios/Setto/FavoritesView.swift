import SwiftUI

/// Masonry grid of every favorited image & video, each tappable into the
/// full-screen TikTok swipe reel (rate 1–5, set approval status, toggle
/// favorite). Backed by `review:favorites`.
struct FavoritesView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.displayScale) private var displayScale
    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    @State private var limit = 60
    @State private var swipeStart: SwipeAnchor?
    @State private var headerHidden = false

    /// Drop items unfavorited inside the swipe reel without needing a reload.
    private var favorites: [MediaItem] { items.filter { $0.favorite } }
    private var canLoadMore: Bool { items.count >= limit }

    var body: some View {
        NavigationStack {
            Group {
                if loading && items.isEmpty {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView(
                        "Couldn't load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error))
                } else if favorites.isEmpty {
                    ContentUnavailableView(
                        "No favorites yet",
                        systemImage: "heart",
                        description: Text(
                            "Tap the heart on any image or video and it’ll collect here."
                        ))
                } else {
                    AutoHidingScroll(headerHidden: $headerHidden) {
                        VStack(spacing: 0) {
                            MasonryGrid(items: favorites) { item in
                                swipeStart = SwipeAnchor(id: item.id)
                            }
                            if canLoadMore {
                                Button {
                                    Task { limit += 60; await load() }
                                } label: {
                                    if loading { ProgressView() } else {
                                        Text("Load more")
                                    }
                                }
                                .buttonStyle(.bordered)
                                .padding(.vertical, 16)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Favorites")
            .toolbar(headerHidden ? .hidden : .visible, for: .navigationBar)
            .overlay(alignment: .bottomTrailing) {
                if !favorites.isEmpty {
                    FloatingButton(systemImage: "play.fill") {
                        if let first = favorites.first {
                            swipeStart = SwipeAnchor(id: first.id)
                        }
                    }
                    .padding(20)
                }
            }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
            .fullScreenCover(item: $swipeStart) { anchor in
                SwipeFeedView(items: $items, startId: anchor.id)
                    .environmentObject(auth)
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            items = try await client.call(
                "review:favorites", .query, args: ["limit": limit],
                as: [MediaItem].self)
            error = nil
            ImageLoader.shared.prefetch(
                items.prefix(30).compactMap(\.thumbURL),
                maxPixel: 512 * displayScale)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
