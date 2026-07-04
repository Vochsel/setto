import SwiftUI

@main
struct SettoApp: App {
    @StateObject private var auth = AuthStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .onChange(of: scenePhase) { _, phase in
                    // The WorkOS access token is short-lived; refresh it when we
                    // come back to the foreground so a token that lapsed while
                    // backgrounded is renewed before the user acts, rather than
                    // failing the next request and dropping them to sign-in.
                    if phase == .active {
                        Task { await auth.refreshIfExpired() }
                    }
                }
        }
    }
}
