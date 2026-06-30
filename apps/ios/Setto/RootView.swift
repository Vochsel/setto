import SwiftUI

struct RootView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        if auth.isAuthenticated {
            TabView {
                GalleryView()
                    .tabItem { Label("Gallery", systemImage: "square.grid.2x2") }
                ShootsView()
                    .tabItem {
                        Label("Shoots", systemImage: "camera.on.rectangle")
                    }
                FavoritesView()
                    .tabItem { Label("Favorites", systemImage: "heart") }
                ModelsView()
                    .tabItem { Label("Models", systemImage: "person.crop.square") }
                AccountView()
                    .tabItem { Label("Account", systemImage: "person.circle") }
            }
        } else if auth.needsResume || auth.resuming {
            ResumingView()
        } else {
            LoginView()
        }
    }
}

/// Shown on launch when a session is remembered but its token expired — resumes
/// silently (WorkOS refreshes server-side) rather than asking to sign in again.
struct ResumingView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            ProgressView()
            Text("Resuming your session…")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .task { await auth.resumeIfNeeded() }
    }
}

struct LoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "sparkles")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Setto").font(.largeTitle.bold())
            Text("Sign in to manage your shoots, models, and campaigns.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
            Button(action: signIn) {
                if busy {
                    ProgressView()
                } else {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.horizontal)
            Spacer()
        }
        .padding()
    }

    private func signIn() {
        Task {
            busy = true
            defer { busy = false }
            do {
                try await auth.login()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct AccountView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        NavigationStack {
            List {
                Section("Signed in as") {
                    Text(auth.user?.name ?? auth.user?.email ?? auth.user?.id ?? "—")
                    if let email = auth.user?.email {
                        Text(email).foregroundStyle(.secondary)
                    }
                }
                Section("Backend") {
                    LabeledContent("Convex", value: Config.convexURL.host ?? "")
                    LabeledContent("Web", value: Config.webURL.host ?? "")
                }
                Section {
                    Button("Sign out", role: .destructive) { auth.logout() }
                }
            }
            .navigationTitle("Account")
        }
    }
}
