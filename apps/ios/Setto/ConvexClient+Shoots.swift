import Foundation

/// Creating shoots and locations on device — the pieces that used to force a
/// trip to the web app. Street View capture runs server-side (`streetview:capture`).
extension ConvexClient {

    /// Create a new shoot; returns its id.
    func createShoot(name: String) async throws -> String {
        try await call(
            "shoots:create", .mutation, args: ["name": name], as: String.self)
    }

    /// Create a location; returns its id. Coordinates enable Street View capture.
    func createLocation(
        name: String, address: String?, lat: Double?, lng: Double?
    ) async throws -> String {
        var args: [String: Any] = ["name": name]
        if let address { args["address"] = address }
        if let lat { args["lat"] = lat }
        if let lng { args["lng"] = lng }
        return try await call(
            "locations:create", .mutation, args: args, as: String.self)
    }

    /// Attach an existing location to a shoot (dedups server-side).
    func addLocationToShoot(shootId: String, locationId: String) async throws {
        try await run(
            "shootLocations:add", .mutation,
            args: ["shootId": shootId, "locationId": locationId])
    }

    /// Kick off a Street View capture for a location (best-effort; needs coords).
    func captureStreetView(locationId: String) async throws {
        try await run(
            "streetview:capture", .action, args: ["locationId": locationId])
    }

    /// All saved locations for the workspace.
    func locations() async throws -> [LocationDoc] {
        try await call("locations:list", .query, as: [LocationDoc].self)
    }
}

/// A saved location (`locations:list`).
struct LocationDoc: Identifiable, Decodable {
    let id: String
    let name: String
    let address: String?
    let lat: Double?
    let lng: Double?
    let imageUrls: [ImageRef]?
    let streetViewUrls: [ImageRef]?

    var thumbURL: URL? {
        URL(string: imageUrls?.first?.url ?? streetViewUrls?.first?.url ?? "")
    }
    var hasImagery: Bool {
        !(imageUrls?.isEmpty ?? true) || !(streetViewUrls?.isEmpty ?? true)
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, address, lat, lng, imageUrls, streetViewUrls
    }
}
