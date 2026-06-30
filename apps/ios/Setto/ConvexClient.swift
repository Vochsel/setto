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

    /// Call a function purely for its side effect (result discarded).
    @discardableResult
    func run(
        _ path: String,
        _ type: FnType = .mutation,
        args: [String: Any] = [:]
    ) async throws -> Empty {
        try await call(path, type, args: args, as: Empty.self)
    }
}

/// Decodes any JSON object we don't care about the shape of.
struct Empty: Decodable {}

/// Acknowledgement from `review:toggleFavorite` (`{ favorite }`).
struct FavoriteAck: Decodable { let favorite: Bool }

// MARK: - Media: upload + review writes

extension ConvexClient {
    /// Upload raw image bytes to Convex storage and return the new storageId.
    /// Mirrors the web app: mint a short-lived URL, POST the file, read the id.
    func uploadImage(
        _ data: Data, contentType: String = "image/jpeg"
    ) async throws -> String {
        guard token != nil else { throw ConvexError.notAuthenticated }
        let uploadURL = try await call(
            "files:generateUploadUrl", .mutation, as: String.self)
        guard let url = URL(string: uploadURL) else {
            throw ConvexError.server("Bad upload URL")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (body, _) = try await URLSession.shared.upload(
            for: request, from: data)
        let json =
            (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
            ?? [:]
        guard let storageId = json["storageId"] as? String else {
            throw ConvexError.server("Upload failed")
        }
        return storageId
    }

    /// Generate from a captured/uploaded photo: the photo is used only as the
    /// scene reference for the chosen image model (it is not saved as a photo),
    /// producing one generation under the location's shot — same pipeline as a
    /// website shot generation.
    @discardableResult
    func generateFromCapture(
        storageId: String,
        modelKey: String,
        shootLocationId: String? = nil,
        shotId: String? = nil,
        modelId: String? = nil,
        outfitId: String? = nil
    ) async throws -> Empty {
        var args: [String: Any] = [
            "storageId": storageId, "modelKey": modelKey,
        ]
        if let shootLocationId { args["shootLocationId"] = shootLocationId }
        if let shotId { args["shotId"] = shotId }
        if let modelId { args["modelId"] = modelId }
        if let outfitId { args["outfitId"] = outfitId }
        return try await run(
            "generate:generateFromCapture", .action, args: args)
    }

    /// Set or clear a media item's rating (1–5, or nil to clear).
    func setRating(_ id: String, _ rating: Int?) async throws {
        try await run(
            "review:setReview",
            args: ["id": id, "rating": rating ?? NSNull()])
    }

    /// Set or clear a media item's approval status.
    func setStatus(_ id: String, _ status: ReviewStatus?) async throws {
        try await run(
            "review:setReview",
            args: ["id": id, "reviewStatus": status?.rawValue ?? NSNull()])
    }

    /// Flip the favorite flag; returns the new value.
    func toggleFavorite(_ id: String) async throws -> Bool {
        let ack = try await call(
            "review:toggleFavorite", .mutation,
            args: ["id": id], as: FavoriteAck.self)
        return ack.favorite
    }
}
