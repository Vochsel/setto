import AuthenticationServices
import SwiftUI
import UIKit

struct SettoUser: Codable, Equatable {
    let id: String
    let email: String?
    let name: String?
}

enum AuthError: LocalizedError {
    case cancelled
    case invalidCallback
    var errorDescription: String? {
        switch self {
        case .cancelled: return "Sign in was cancelled."
        case .invalidCallback: return "The login response was invalid."
        }
    }
}

/// Logs in through the same web bridge the CLI uses, but with a custom URL
/// scheme (setto://) via ASWebAuthenticationSession. Stores the WorkOS access
/// token in the Keychain and exposes it to the Convex client.
@MainActor
final class AuthStore: NSObject, ObservableObject,
    ASWebAuthenticationPresentationContextProviding
{
    @Published private(set) var user: SettoUser?
    /// True while silently resuming a remembered session on launch.
    @Published private(set) var resuming = false
    private var session: ASWebAuthenticationSession?
    /// The in-flight silent refresh, if any. Concurrent callers (a pull-to-
    /// refresh and a background reload firing at once) share this single web
    /// session instead of each spawning their own.
    private var refreshTask: Task<Void, Error>?

    private let tokenKey = "accessToken"
    private let expiryKey = "expiresAt"
    private let userKey = "user"

    override init() {
        super.init()
        user = loadUser()
    }

    var isAuthenticated: Bool { user != nil && validToken() != nil }

    /// We remember who was signed in, but their access token has expired — the
    /// app should resume the session rather than ask for credentials again.
    var needsResume: Bool { user != nil && validToken() == nil }

    /// A non-expired access token, or nil if the user must (re)authenticate.
    func validToken() -> String? {
        guard let token = Keychain.get(tokenKey) else { return nil }
        let expiresAt = UserDefaults.standard.double(forKey: expiryKey)
        // expiresAt is epoch milliseconds; refresh 30s early.
        guard expiresAt - 30_000 > Date().timeIntervalSince1970 * 1000 else {
            return nil
        }
        return token
    }

    /// A valid access token, silently refreshing an expired one first. Data
    /// loads and mutations go through this (via `client()`), so the session
    /// stays alive across the short WorkOS access-token lifetime — the reason
    /// the app used to "lose" auth after sitting idle or on pull-to-refresh.
    /// Returns nil only when nobody is signed in or the WorkOS session itself
    /// has ended (in which case the user is signed out).
    func token() async -> String? {
        if let token = validToken() { return token }
        guard user != nil else { return nil }
        try? await refresh()
        return validToken()
    }

    /// A Convex client that resolves (and refreshes) the token per request.
    func client() -> ConvexClient {
        ConvexClient(
            baseURL: Config.convexURL,
            token: validToken(),
            tokenProvider: { [weak self] in await self?.token() })
    }

    /// Silently re-run the web bridge to mint a fresh access token, coalescing
    /// concurrent callers onto one session. WorkOS refreshes server-side from
    /// its still-valid session cookie, so this usually completes without a login
    /// form; if that session is gone the sign-in surfaces (or the caller backs
    /// out) and we sign the user out so the UI asks again.
    func refresh() async throws {
        if let refreshTask { return try await refreshTask.value }
        let task = Task {
            do {
                try await self.login()
            } catch {
                self.logout()
                throw error
            }
        }
        refreshTask = task
        defer { refreshTask = nil }
        try await task.value
    }

    /// Resume a remembered session on launch (drives `ResumingView`). Unlike the
    /// old one-shot resume, this can run again every time the token lapses.
    func resumeIfNeeded() async {
        guard needsResume, refreshTask == nil else { return }
        resuming = true
        defer { resuming = false }
        try? await refresh()
    }

    /// Refresh proactively when the app returns to the foreground so the token
    /// is fresh before the user acts (e.g. pull-to-refresh) rather than lapsing
    /// mid-request. No-op while valid or signed out.
    func refreshIfExpired() async {
        guard needsResume else { return }
        try? await refresh()
    }

    func login() async throws {
        let state = UUID().uuidString
        var comps = URLComponents(
            url: Config.webURL.appendingPathComponent("cli-login"),
            resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "redirect", value: "\(Config.callbackScheme)://auth"),
            URLQueryItem(name: "state", value: state),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(
                url: comps.url!,
                callbackURLScheme: Config.callbackScheme
            ) { url, error in
                if let url {
                    cont.resume(returning: url)
                } else {
                    cont.resume(throwing: error ?? AuthError.cancelled)
                }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            self.session = s
            s.start()
        }

        let items =
            URLComponents(url: callback, resolvingAgainstBaseURL: false)?
            .queryItems ?? []
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }
        guard value("state") == state, let token = value("access_token") else {
            throw AuthError.invalidCallback
        }

        Keychain.set(token, for: tokenKey)
        let expiresAt =
            Double(value("expires_at") ?? "")
            ?? (Date().timeIntervalSince1970 * 1000 + 600_000)
        UserDefaults.standard.set(expiresAt, forKey: expiryKey)

        let u = SettoUser(
            id: value("sub") ?? "", email: value("email"), name: value("name"))
        saveUser(u)
        user = u
    }

    func logout() {
        Keychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: expiryKey)
        saveUser(nil)
        user = nil
    }

    // MARK: - Persistence

    private func saveUser(_ u: SettoUser?) {
        if let u, let data = try? JSONEncoder().encode(u) {
            UserDefaults.standard.set(data, forKey: userKey)
        } else {
            UserDefaults.standard.removeObject(forKey: userKey)
        }
    }

    private func loadUser() -> SettoUser? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else {
            return nil
        }
        return try? JSONDecoder().decode(SettoUser.self, from: data)
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession)
        -> ASPresentationAnchor
    {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
