import Foundation

/// Where the app talks to. Point `webURL` at your deployed web app (it performs
/// the WorkOS login bridge at /cli-login) and `convexURL` at the Convex
/// deployment. Both can be overridden at runtime via the environment.
enum Config {
    static let convexURL = URL(
        string: ProcessInfo.processInfo.environment["SETTO_CONVEX_URL"]
            ?? "https://formal-warthog-79.convex.cloud")!

    /// The web app that signs the user in and redirects the token back. This is
    /// the live site (or http://localhost:3000 for dev on a simulator); override
    /// at runtime with SETTO_WEB_URL.
    static let webURL = URL(
        string: ProcessInfo.processInfo.environment["SETTO_WEB_URL"]
            ?? "https://setto.vochsel.com")!

    /// Must match a CFBundleURLScheme in Info.plist and the scheme the web
    /// bridge is allowed to redirect to.
    static let callbackScheme = "setto"
}
