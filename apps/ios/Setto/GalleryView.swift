import SwiftUI

/// The workspace gallery / dashboard: every image & video across the team in one
/// grid, filterable by media kind and favorites, and tappable into the
/// full-screen TikTok swipe reel. Backed by the unified `review:feed`.
struct GalleryView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.displayScale) private var displayScale
    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    /// Bounded page size — grows via "Load more" instead of pulling the whole
    /// org feed (which used to load and decode every image up front).
    @State private var limit = 60

    @State private var kind: FeedKind = .all
    @State private var favOnly = false
    @State private var swipeStart: SwipeAnchor?
    @State private var headerHidden = false

    /// There may be more to load when we filled the current page exactly.
    private var canLoadMore: Bool { items.count >= limit }

    private var filtered: [MediaItem] {
        items.filter { item in
            if favOnly && !item.favorite { return false }
            switch kind {
            case .all: return true
            case .image: return !item.isVideo
            case .video: return item.isVideo
            }
        }
    }

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
                } else if items.isEmpty {
                    ContentUnavailableView(
                        "Nothing here yet",
                        systemImage: "photo.on.rectangle.angled",
                        description: Text(
                            "Generated photos and videos show up here."))
                } else {
                    content
                }
            }
            .navigationTitle("Gallery")
            .toolbar(headerHidden ? .hidden : .visible, for: .navigationBar)
            .overlay(alignment: .bottomTrailing) {
                if !filtered.isEmpty {
                    FloatingButton(systemImage: "play.fill") {
                        if let first = filtered.first {
                            swipeStart = SwipeAnchor(id: first.id)
                        }
                    }
                    .padding(20)
                }
            }
            .refreshable { await load() }
            // Retain across tab switches — only fetch when we have nothing yet.
            .task { if items.isEmpty { await load() } }
            .fullScreenCover(item: $swipeStart) { anchor in
                SwipeFeedView(items: $items, startId: anchor.id)
                    .environmentObject(auth)
            }
        }
    }

    private var content: some View {
        // Filter bar lives inside the scroll so it scrolls away with the header.
        AutoHidingScroll(headerHidden: $headerHidden) {
            VStack(spacing: 0) {
                filterBar
                MasonryGrid(items: filtered) { item in
                    swipeStart = SwipeAnchor(id: item.id)
                }
                if canLoadMore && !favOnly && kind == .all {
                    Button {
                        Task { limit += 60; await load() }
                    } label: {
                        if loading {
                            ProgressView()
                        } else {
                            Text("Load more")
                        }
                    }
                    .buttonStyle(.bordered)
                    .padding(.vertical, 16)
                }
            }
        }
    }

    private var filterBar: some View {
        HStack(spacing: 8) {
            Picker("Kind", selection: $kind) {
                ForEach(FeedKind.allCases) { k in
                    Text(k.label).tag(k)
                }
            }
            .pickerStyle(.segmented)

            Button {
                favOnly.toggle()
            } label: {
                Image(systemName: favOnly ? "heart.fill" : "heart")
                    .foregroundStyle(favOnly ? .red : .secondary)
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            items = try await client.call(
                "review:feed", .query, args: ["limit": limit],
                as: [MediaItem].self)
            error = nil
            // Warm the first screenful at the tile's exact pixel size so early
            // scrolling is instant (must match MasonryTile's default maxWidth).
            ImageLoader.shared.prefetch(
                items.prefix(30).compactMap(\.thumbURL),
                maxPixel: 512 * displayScale)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The grid's media-kind filter.
enum FeedKind: String, CaseIterable, Identifiable {
    case all, image, video
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "All"
        case .image: return "Photos"
        case .video: return "Videos"
        }
    }
}

/// Identifiable wrapper so a tapped media id can drive `.fullScreenCover(item:)`.
struct SwipeAnchor: Identifiable {
    let id: String
}
