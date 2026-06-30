import SwiftUI

/// The Videos tab — a gallery of video projects plus a "New video" menu.
struct VideosView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var projects: [VideoProjectCard] = []
    @State private var loading = true
    @State private var error: String?
    @State private var path = NavigationPath()
    @State private var creating = false

    private let columns = [
        GridItem(.adaptive(minimum: 110), spacing: 10)
    ]

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if loading {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView(
                        "Couldn't load videos", systemImage: "film",
                        description: Text(error))
                } else if projects.isEmpty {
                    ContentUnavailableView {
                        Label("No videos yet", systemImage: "film")
                    } description: {
                        Text("Create a video from your shots.")
                    } actions: {
                        newMenu
                    }
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(projects) { p in
                                NavigationLink(value: p.id) {
                                    ProjectTile(project: p)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Videos")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { newMenu }
            }
            .navigationDestination(for: String.self) { id in
                VideoEditorView(projectId: id)
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var newMenu: some View {
        Menu {
            ForEach(videoTemplates) { t in
                Button("\(t.emoji)  \(t.name)") { create(templateId: t.id) }
            }
        } label: {
            if creating { ProgressView() } else { Label("New", systemImage: "plus") }
        }
        .disabled(creating)
    }

    private func client() -> ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    private func load() async {
        do {
            projects = try await client().listVideoProjects()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func create(templateId: String) {
        Task {
            creating = true
            defer { creating = false }
            do {
                let id = try await client().createVideoProject(
                    templateId: templateId)
                path.append(id)
                await load()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private struct ProjectTile: View {
    let project: VideoProjectCard

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .bottomTrailing) {
                AsyncImage(url: project.thumbURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        Rectangle().fill(.quaternary)
                            .overlay(
                                Image(systemName: "film")
                                    .foregroundStyle(.secondary))
                    }
                }
                .frame(height: 180)
                .frame(maxWidth: .infinity)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Text(project.durationLabel)
                    .font(.caption2.bold())
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.6), in: Capsule())
                    .foregroundStyle(.white)
                    .padding(6)
            }
            Text(project.name).font(.subheadline).lineLimit(1)
            Text("\(project.clipCount) clip\(project.clipCount == 1 ? "" : "s")")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
