import Foundation

/// Creating shoots and locations on device — the pieces that used to force a
/// trip to the web app. Street View capture runs server-side (`streetview:capture`).
extension ConvexClient {

    /// Create a new shoot; returns its id.
    func createShoot(name: String) async throws -> String {
        try await call(
            "shoots:create", .mutation, args: ["name": name], as: String.self)
    }

    /// Create a location; returns its id. Coordinates enable Street View capture;
    /// `promptDescriptor` seeds prompted backdrops; `imageStorageIds` attaches
    /// already-uploaded photos as reference images (the "upload" flow).
    func createLocation(
        name: String, address: String? = nil, lat: Double? = nil,
        lng: Double? = nil, promptDescriptor: String? = nil,
        imageStorageIds: [String]? = nil
    ) async throws -> String {
        var args: [String: Any] = ["name": name]
        if let address { args["address"] = address }
        if let lat { args["lat"] = lat }
        if let lng { args["lng"] = lng }
        if let promptDescriptor, !promptDescriptor.isEmpty {
            args["promptDescriptor"] = promptDescriptor
        }
        if let imageStorageIds, !imageStorageIds.isEmpty {
            args["images"] = imageStorageIds.map {
                ["storageId": $0, "source": "upload"]
            }
        }
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
    /// Pass `radiusMeters > 0` to also sample random nearby points ("expand
    /// search radius"). Returns how many frames were added.
    @discardableResult
    func captureStreetView(locationId: String, radiusMeters: Double? = nil)
        async throws -> CaptureAck
    {
        var args: [String: Any] = ["locationId": locationId]
        if let radiusMeters { args["radiusMeters"] = radiusMeters }
        return try await call(
            "streetview:capture", .action, args: args, as: CaptureAck.self)
    }

    /// Persist a location's Street View expansion setting (so shoots reuse it).
    func updateLocationRadius(
        locationId: String, enabled: Bool, meters: Double
    ) async throws {
        try await run(
            "locations:update", .mutation,
            args: [
                "id": locationId,
                "streetViewRadiusEnabled": enabled,
                "streetViewRadiusMeters": meters,
            ])
    }

    /// All saved locations for the workspace.
    func locations() async throws -> [LocationDoc] {
        try await call("locations:list", .query, as: [LocationDoc].self)
    }
}

/// Result of `streetview:capture` (`{ added, fromCache }`).
struct CaptureAck: Decodable {
    let added: Int?
    let fromCache: Bool?
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
    let streetViewRadiusEnabled: Bool?
    let streetViewRadiusMeters: Double?

    var thumbURL: URL? {
        URL(string: imageUrls?.first?.url ?? streetViewUrls?.first?.url ?? "")
    }
    var hasImagery: Bool {
        !(imageUrls?.isEmpty ?? true) || !(streetViewUrls?.isEmpty ?? true)
    }
    /// Street View capture needs coordinates to snap to.
    var hasCoords: Bool { lat != nil && lng != nil }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, address, lat, lng, imageUrls, streetViewUrls
        case streetViewRadiusEnabled, streetViewRadiusMeters
    }
}
