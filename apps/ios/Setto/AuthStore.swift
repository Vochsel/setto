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
    private var didTryResume = false

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

    /// Resume a remembered session on launch by re-running the web bridge once.
    /// WorkOS refreshes the access token server-side from its still-valid
    /// session, so this completes without a login form while that session is
    /// alive; if it's gone (or the user backs out), fall back to sign-in.
    func resumeIfNeeded() async {
        guard needsResume, !didTryResume, !resuming else { return }
        didTryResume = true
        resuming = true
        defer { resuming = false }
        do {
            try await login()
        } catch {
            logout()
        }
    }

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
