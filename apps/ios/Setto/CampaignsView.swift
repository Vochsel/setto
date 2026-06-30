import SwiftUI

struct CampaignsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var campaigns: [Campaign] = []
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            Group {
                if loading && campaigns.isEmpty {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView(
                        "Couldn't load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error))
                } else if campaigns.isEmpty {
                    ContentUnavailableView(
                        "No campaigns yet", systemImage: "megaphone")
                } else {
                    List(campaigns) { campaign in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(campaign.name).font(.headline)
                            if let brief = campaign.brief, !brief.isEmpty {
                                Text(brief)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            Text(campaign.status.capitalized)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(.quaternary, in: Capsule())
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Campaigns")
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
            campaigns = try await client.call(
                "campaigns:list", .query, as: [Campaign].self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
