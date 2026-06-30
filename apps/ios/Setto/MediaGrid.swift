import SwiftUI

/// A Pinterest-style masonry grid that renders each media item at its natural
/// aspect ratio (no fixed-height cropping). Items are spread round-robin across
/// `columns` so column heights stay roughly balanced. Wrap in a ScrollView.
struct MasonryGrid: View {
    let items: [MediaItem]
    var columns: Int = 2
    var spacing: CGFloat = 6
    let onTap: (MediaItem) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: spacing) {
            ForEach(0..<columns, id: \.self) { column in
                LazyVStack(spacing: spacing) {
                    ForEach(columnItems(column)) { item in
                        MasonryTile(item: item)
                            .onTapGesture { onTap(item) }
                    }
                }
            }
        }
        .padding(spacing)
    }

    private func columnItems(_ column: Int) -> [MediaItem] {
        items.enumerated()
            .filter { $0.offset % columns == column }
            .map { $0.element }
    }
}

/// A single masonry cell: the image (or video poster) at its real aspect ratio
/// with rating/status badges, a favorite heart shown ONLY when favorited, and a
/// play glyph for videos.
struct MasonryTile: View {
    let item: MediaItem

    var body: some View {
        AsyncImage(url: item.thumbURL) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFit()
            case .empty:
                placeholder.overlay(ProgressView().tint(.secondary))
            default:
                placeholder.overlay(
                    Image(systemName: "photo").foregroundStyle(.secondary))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .topLeading) { badges }
        .overlay(alignment: .bottomTrailing) { heart }
        .overlay(alignment: .bottomLeading) { videoGlyph }
    }

    /// Stable-height placeholder (3:4) so layout doesn't jump before load.
    private var placeholder: some View {
        Rectangle()
            .fill(.gray.opacity(0.12))
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
    }

    @ViewBuilder private var badges: some View {
        if (item.rating ?? 0) > 0 || item.reviewStatus != nil {
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
        }
    }

    @ViewBuilder private var heart: some View {
        if item.favorite {
            Image(systemName: "heart.fill")
                .font(.caption)
                .foregroundStyle(.red)
                .padding(6)
                .background(.black.opacity(0.45), in: Circle())
                .padding(6)
        }
    }

    @ViewBuilder private var videoGlyph: some View {
        if item.isVideo {
            Image(systemName: "play.fill")
                .font(.caption2)
                .foregroundStyle(.white)
                .padding(6)
                .background(.black.opacity(0.45), in: Circle())
                .padding(6)
        }
    }
}
