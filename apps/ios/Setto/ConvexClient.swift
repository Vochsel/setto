import Foundation

enum FnType: String {
    case query, mutation, action
}

enum ConvexError: LocalizedError {
    case notAuthenticated
    case server(String)
    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "Please sign in."
        case .server(let m): return m
        }
    }
}

/// Minimal client for Convex's HTTP API. Mirrors the shared @setto/core `call`
/// layer: route any function path to query/mutation/action. Paths use the
/// "module:function" form, e.g. "campaigns:list".
struct ConvexClient {
    let baseURL: URL
    let token: String?

    /// Call a function and decode its result.
    func call<T: Decodable>(
        _ path: String,
        _ type: FnType = .query,
        args: [String: Any] = [:],
        as _: T.Type
    ) async throws -> T {
        guard let token else { throw ConvexError.notAuthenticated }

        var request = URLRequest(
            url: baseURL.appendingPathComponent("api/\(type.rawValue)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "path": path,
            "args": args,
            "format": "json",
        ])

        let (data, _) = try await URLSession.shared.data(for: request)
        let json =
            (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            ?? [:]

        guard (json["status"] as? String) == "success" else {
            throw ConvexError.server(
                json["errorMessage"] as? String ?? "Request failed")
        }

        // Re-serialize the `value` and decode it into the requested type.
        let value = json["value"] ?? NSNull()
        let valueData = try JSONSerialization.data(
            withJSONObject: value, options: [.fragmentsAllowed])
        return try JSONDecoder().decode(T.self, from: valueData)
    }
}
