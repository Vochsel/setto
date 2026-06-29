import Foundation

/// Where the app talks to. Point `webURL` at your deployed web app (it performs
/// the WorkOS login bridge at /cli-login) and `convexURL` at the Convex
/// deployment. Both can be overridden at runtime via the environment.
enum Config {
    static let convexURL = URL(
        string: ProcessInfo.processInfo.environment["SETTO_CONVEX_URL"]
            ?? "https://formal-warthog-79.convex.cloud")!

    /// The web app that signs the user in and redirects the token back.
    /// Change this to your real domain (or http://localhost:3000 for dev on a
    /// simulator).
    static let webURL = URL(
        string: ProcessInfo.processInfo.environment["SETTO_WEB_URL"]
            ?? "https://app.setto.dev")!

    /// Must match a CFBundleURLScheme in Info.plist and the scheme the web
    /// bridge is allowed to redirect to.
    static let callbackScheme = "setto"
}
