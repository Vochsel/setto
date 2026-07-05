import Foundation

// Prompted location backdrops — generate empty establishing scenes for a
// location from a text description (interiors especially, where Street View is
// thin), stream the candidates in, and keep the ones you like as references.
// Mirrors the web app's generate:generateBackdrops / locations:listBackdrops.

struct BackdropIdsAck: Decodable { let backdropIds: [String] }

/// A candidate location backdrop (`locations:listBackdrops`).
struct BackdropDoc: Identifiable, Decodable {
    let id: String
    let status: String  // queued | generating | succeeded | failed
    let imageUrl: String?
    let thumbUrl: String?
    let kept: Bool?
    let userPrompt: String?
    let progressLabel: String?
    let error: String?

    var isPending: Bool { status == "queued" || status == "generating" }
    var isKept: Bool { kept ?? false }
    var thumbURL: URL? { URL(string: thumbUrl ?? imageUrl ?? "") }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case status, imageUrl, thumbUrl, kept, userPrompt, progressLabel, error
    }
}

extension ConvexClient {
    /// Queue N backdrop candidates for a location from a text description.
    @discardableResult
    func generateBackdrops(
        locationId: String, description: String?, interior: Bool = true,
        count: Int = 4, modelKey: String? = nil
    ) async throws -> [String] {
        var args: [String: Any] = [
            "locationId": locationId, "interior": interior, "count": count,
        ]
        if let description, !description.isEmpty {
            args["description"] = description
        }
        if let modelKey { args["modelKey"] = modelKey }
        let ack = try await call(
            "generate:generateBackdrops", .action, args: args,
            as: BackdropIdsAck.self)
        return ack.backdropIds
    }

    /// Candidate backdrops for a location (newest first) — poll while pending.
    func locationBackdrops(locationId: String) async throws -> [BackdropDoc] {
        try await call(
            "locations:listBackdrops", .query,
            args: ["locationId": locationId], as: [BackdropDoc].self)
    }

    /// Keep a finished candidate as one of the location's reference images.
    func keepBackdrop(id: String) async throws {
        try await run("locations:keepBackdrop", .mutation, args: ["id": id])
    }

    /// Remove a kept candidate from the location's references.
    func unkeepBackdrop(id: String) async throws {
        try await run("locations:unkeepBackdrop", .mutation, args: ["id": id])
    }

    /// Discard a candidate entirely.
    func removeBackdrop(id: String) async throws {
        try await run("locations:removeBackdrop", .mutation, args: ["id": id])
    }
}
