import SwiftUI

/// Grid of every favorited image & video, each tappable into a review sheet
/// (rate 1–5, set approval status, toggle favorite). Backed by `review:*`.
struct FavoritesView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    @State private var selected: MediaItem?

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

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
                        "No favorites yet",
                        systemImage: "heart",
                        description: Text(
                            "Tap the heart on any image or video and it’ll collect here."
                        ))
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(items) { item in
                                MediaTile(item: item)
                                    .onTapGesture { selected = item }
                            }
                        }
                        .padding(8)
                    }
                }
            }
            .navigationTitle("Favorites")
            .refreshable { await load() }
            .task { await load() }
            .sheet(item: $selected) { item in
                MediaReviewSheet(item: item) { updated in
                    apply(updated)
                }
                .environmentObject(auth)
            }
        }
    }

    /// Reflect an edit from the sheet into the grid (and drop un-favorited items).
    private func apply(_ updated: MediaItem) {
        if !updated.favorite {
            items.removeAll { $0.id == updated.id }
        } else if let i = items.firstIndex(where: { $0.id == updated.id }) {
            items[i] = updated
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

/// A single thumbnail with a favorite heart and rating/status badges overlaid.
struct MediaTile: View {
    let item: MediaItem

    var body: some View {
        ZStack(alignment: .topLeading) {
            AsyncImage(url: item.thumbURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color.gray.opacity(0.15)
                }
            }
            .frame(height: 150)
            .frame(maxWidth: .infinity)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Rating + status badge.
            HStack(spacing: 4) {
                if let rating = item.rating, rating > 0 {
                    Label("\(rating)", systemImage: "star.fill")
                        .labelStyle(.titleAndIcon)
                }
                if let status = item.reviewStatus,
                    let s = ReviewStatus(rawValue: status)
                {
                    Image(systemName: s.symbol)
                }
            }
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(.black.opacity(0.55), in: Capsule())
            .padding(6)

            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Image(systemName: "heart.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(6)
                        .background(.black.opacity(0.45), in: Circle())
                        .padding(6)
                }
            }

            if item.isVideo {
                VStack {
                    Spacer()
                    HStack {
                        Image(systemName: "play.fill")
                            .font(.caption2)
                            .foregroundStyle(.white)
                            .padding(6)
                            .background(.black.opacity(0.45), in: Circle())
                            .padding(6)
                        Spacer()
                    }
                }
            }
        }
    }
}

/// Review sheet: preview + 5-star rating + approval status + favorite toggle.
/// Every change is written through `review:setReview` / `review:toggleFavorite`.
struct MediaReviewSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var item: MediaItem
    @State private var busy = false
    @State private var error: String?
    let onChange: (MediaItem) -> Void

    init(item: MediaItem, onChange: @escaping (MediaItem) -> Void) {
        _item = State(initialValue: item)
        self.onChange = onChange
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    AsyncImage(url: URL(string: item.url)) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFit()
                        default:
                            Color.gray.opacity(0.15).frame(height: 240)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                    if let label = item.modelLabel {
                        Text(label).font(.subheadline).foregroundStyle(.secondary)
                    }

                    // Rating
                    HStack(spacing: 8) {
                        ForEach(1...5, id: \.self) { n in
                            Button {
                                setRating(n == (item.rating ?? 0) ? nil : n)
                            } label: {
                                Image(
                                    systemName: n <= (item.rating ?? 0)
                                        ? "star.fill" : "star"
                                )
                                .font(.title2)
                                .foregroundStyle(.yellow)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Status
                    HStack(spacing: 8) {
                        ForEach(ReviewStatus.allCases) { status in
                            let active = item.reviewStatus == status.rawValue
                            Button {
                                setStatus(active ? nil : status)
                            } label: {
                                Label(status.label, systemImage: status.symbol)
                                    .font(.caption.bold())
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        active
                                            ? Color.accentColor.opacity(0.2)
                                            : Color.gray.opacity(0.12),
                                        in: Capsule()
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Favorite
                    Button {
                        toggleFavorite()
                    } label: {
                        Label(
                            item.favorite ? "Favorited" : "Favorite",
                            systemImage: item.favorite ? "heart.fill" : "heart"
                        )
                        .foregroundStyle(item.favorite ? .red : .primary)
                    }
                    .buttonStyle(.bordered)

                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding()
                .disabled(busy)
            }
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Mutations

    private func setRating(_ rating: Int?) {
        let previous = item.rating
        item.rating = rating
        write([
            "id": item.id,
            "rating": rating ?? NSNull(),
        ]) { item.rating = previous }
    }

    private func setStatus(_ status: ReviewStatus?) {
        let previous = item.reviewStatus
        item.reviewStatus = status?.rawValue
        write([
            "id": item.id,
            "reviewStatus": status?.rawValue ?? NSNull(),
        ]) { item.reviewStatus = previous }
    }

    private func toggleFavorite() {
        let previous = item.favorite
        item.favorite.toggle()
        Task {
            busy = true
            defer { busy = false }
            do {
                let client = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                _ = try await client.call(
                    "review:toggleFavorite", .mutation,
                    args: ["id": item.id], as: ReviewAck.self)
                error = nil
                onChange(item)
            } catch {
                item.favorite = previous
                self.error = error.localizedDescription
            }
        }
    }

    /// Run a `review:setReview` mutation; revert local state on failure.
    private func write(_ args: [String: Any], revert: @escaping () -> Void) {
        Task {
            busy = true
            defer { busy = false }
            do {
                let client = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                _ = try await client.call(
                    "review:setReview", .mutation, args: args,
                    as: ReviewAck.self)
                error = nil
                onChange(item)
            } catch {
                revert()
                self.error = error.localizedDescription
            }
        }
    }
}

/// Loose acknowledgement for the review mutations (`{ok}` or `{favorite}`).
struct ReviewAck: Decodable {}
