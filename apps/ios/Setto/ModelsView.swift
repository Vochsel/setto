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
                        Label(
                            model.name ?? "Untitled model",
                            systemImage: "person.crop.square")
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
