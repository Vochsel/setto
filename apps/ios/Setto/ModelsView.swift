import SwiftUI

struct ModelsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var models: [ModelDoc] = []
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            Group {
                if loading && models.isEmpty {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView(
                        "Couldn't load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error))
                } else if models.isEmpty {
                    ContentUnavailableView(
                        "No models yet", systemImage: "person.crop.square")
                } else {
                    List(models) { model in
                        NavigationLink {
                            ModelDetailView(model: model)
                                .environmentObject(auth)
                        } label: {
                            ModelRow(model: model)
                        }
                    }
                }
            }
            .navigationTitle("Models")
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
            models = try await client.call(
                "models:list", .query, as: [ModelDoc].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A model list row with its headshot thumbnail.
private struct ModelRow: View {
    let model: ModelDoc

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: model.thumbURL) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Color.gray.opacity(0.15)
                        .overlay(
                            Image(systemName: "person.crop.square")
                                .foregroundStyle(.secondary))
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Text(model.name ?? "Untitled model").font(.headline)
        }
        .padding(.vertical, 2)
    }
}

/// Every photo & video featuring a model, as a masonry grid swipeable into the
/// TikTok reel. Backed by `review:feed` filtered to this model.
struct ModelDetailView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let model: ModelDoc

    @State private var items: [MediaItem] = []
    @State private var error: String?
    @State private var loading = false
    @State private var swipeStart: SwipeAnchor?
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
                    description: Text("This model has no media yet."))
            } else {
                AutoHidingScroll(headerHidden: $headerHidden) {
                    MasonryGrid(items: items) { item in
                        swipeStart = SwipeAnchor(id: item.id)
                    }
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if !items.isEmpty {
                FloatingButton(systemImage: "play.fill") {
                    if let first = items.first {
                        swipeStart = SwipeAnchor(id: first.id)
                    }
                }
                .padding(20)
            }
        }
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
        .navigationTitle(model.name ?? "Model")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(headerHidden ? .hidden : .visible, for: .navigationBar)
        .refreshable { await load() }
        .task { await load() }
        .fullScreenCover(item: $swipeStart) { anchor in
            SwipeFeedView(items: $items, startId: anchor.id)
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
                args: ["modelId": model.id], as: [MediaItem].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
