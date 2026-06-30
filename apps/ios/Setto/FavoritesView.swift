import SwiftUI

/// Masonry grid of every favorited image & video, each tappable into the
/// full-screen TikTok swipe reel (rate 1–5, set approval status, toggle
/// favorite). Backed by `review:favorites`.
struct FavoritesView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    @State private var swipeStart: SwipeAnchor?

    /// Drop items unfavorited inside the swipe reel without needing a reload.
    private var favorites: [MediaItem] { items.filter { $0.favorite } }

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
                    ScrollView {
                        MasonryGrid(items: favorites) { item in
                            swipeStart = SwipeAnchor(id: item.id)
                        }
                    }
                }
            }
            .navigationTitle("Favorites")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if let first = favorites.first {
                            swipeStart = SwipeAnchor(id: first.id)
                        }
                    } label: {
                        Image(systemName: "play.rectangle.fill")
                    }
                    .disabled(favorites.isEmpty)
                }
            }
            .refreshable { await load() }
            .task { await load() }
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
            let client = ConvexClient(
                baseURL: Config.convexURL, token: auth.validToken())
            items = try await client.call(
                "review:favorites", .query, as: [MediaItem].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
