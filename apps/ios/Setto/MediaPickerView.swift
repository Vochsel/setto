import SwiftUI

/// Pick images/videos from the workspace gallery to attach to a social post.
/// Reuses the unified `review:feed` (succeeded media only) the Gallery uses.
struct MediaPickerView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let onPick: ([SocialMedia]) -> Void

    @State private var items: [MediaItem] = []
    @State private var selected: [String: SocialMedia] = [:]
    @State private var loading = false

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 3)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 3) {
                    ForEach(items) { item in
                        tile(item)
                    }
                }
                .padding(3)
            }
            .overlay {
                if loading && items.isEmpty {
                    ProgressView()
                } else if items.isEmpty {
                    ContentUnavailableView(
                        "No media yet", systemImage: "photo.on.rectangle",
                        description: Text("Generated photos and videos show up here."))
                }
            }
            .navigationTitle("Add media")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add\(selected.isEmpty ? "" : " \(selected.count)")") {
                        onPick(Array(selected.values))
                        dismiss()
                    }
                    .disabled(selected.isEmpty)
                }
            }
            .task { await load() }
        }
    }

    private func tile(_ item: MediaItem) -> some View {
        let isOn = selected[item.id] != nil
        return CachedAsyncImage(url: item.thumbURL) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            default: Color.gray.opacity(0.15)
            }
        }
        .frame(minHeight: 100)
        .aspectRatio(1, contentMode: .fill)
        .clipShape(.rect(cornerRadius: 6))
        .overlay(alignment: .topLeading) {
            if item.isVideo {
                Image(systemName: "film.fill")
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .padding(4)
                    .shadow(radius: 2)
            }
        }
        .overlay(alignment: .topTrailing) {
            if isOn {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.white, .tint)
                    .padding(4)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(isOn ? Color.accentColor : .clear, lineWidth: 3)
        }
        .contentShape(Rectangle())
        .onTapGesture { toggle(item) }
    }

    private func toggle(_ item: MediaItem) {
        if selected[item.id] != nil {
            selected[item.id] = nil
        } else {
            selected[item.id] = SocialMedia(
                type: item.isVideo ? "video" : "image",
                url: item.url,
                thumbnailUrl: item.isVideo ? item.posterUrl : nil)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await auth.client().call(
                "review:feed", .query, args: ["limit": 120],
                as: [MediaItem].self)
        } catch {
            items = []
        }
    }
}
