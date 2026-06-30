import Foundation

/// Light Codable views of the Convex documents the screens render. Convex
/// returns extra fields (e.g. _creationTime, computed counts) which Decodable
/// ignores.
struct Campaign: Identifiable, Decodable {
    let id: String
    let name: String
    let status: String
    let brief: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, status, brief
    }
}

/// A resolved reference image. The backend's `resolveImages` returns these as
/// `{ url, caption?, source? }` objects (NOT bare strings).
struct ImageRef: Decodable, Hashable {
    let url: String
    let caption: String?
    let source: String?
}

struct ModelDoc: Identifiable, Decodable {
    let id: String
    let name: String?
    let imageUrls: [ImageRef]?
    let headshotUrl: String?

    /// Best small reference image for the model (its headshot, else any image).
    var thumbURL: URL? {
        URL(string: headshotUrl ?? imageUrls?.first?.url ?? "")
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, imageUrls, headshotUrl
    }
}

/// A product/outfit from the library, used to tag a captured photo.
struct OutfitDoc: Identifiable, Decodable {
    let id: String
    let name: String
    let categoryName: String?
    let imageUrls: [ImageRef]?

    var thumbURL: URL? { URL(string: imageUrls?.first?.url ?? "") }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, categoryName, imageUrls
    }
}

/// A shoot card (from `shoots:list`) with the light counts the list renders.
struct Shoot: Identifiable, Decodable {
    let id: String
    let name: String
    let status: String
    let description: String?
    let locationCount: Int?
    let shotCount: Int?
    let recentImages: [String]?

    var coverURL: URL? { URL(string: recentImages?.first ?? "") }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, status, description, locationCount, shotCount, recentImages
    }
}

/// A location within a shoot (from `shootLocations:listByShoot`) — what a camera
/// capture is attached to, plus the models present there.
struct ShootLocationDoc: Identifiable, Decodable {
    let id: String  // the shootLocation id
    let location: LocationInfo?
    let models: [PresentModel]

    var name: String { location?.name ?? "Location" }
    var thumbURL: URL? {
        URL(
            string: location?.imageUrls?.first?.url
                ?? location?.streetViewUrls?.first?.url ?? "")
    }

    struct LocationInfo: Decodable {
        let name: String
        let imageUrls: [ImageRef]?
        let streetViewUrls: [ImageRef]?
    }

    struct PresentModel: Identifiable, Decodable {
        let id: String
        let name: String?
        enum CodingKeys: String, CodingKey {
            case id = "_id"
            case name
        }
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case location, models
    }
}

/// A rateable media item (image or video) as returned by `review:favorites`.
/// The same shape backs the favorites grid and the review controls.
struct MediaItem: Identifiable, Decodable, Equatable {
    let id: String
    let kind: String  // "image" | "video"
    let url: String
    let posterUrl: String?
    var rating: Int?
    var reviewStatus: String?  // "approved" | "rejected" | "needs_changes"
    var favorite: Bool
    let modelLabel: String?
    let prompt: String?
    let modelId: String?  // present on `review:feed` rows, for local filtering
    let shootId: String?

    var isVideo: Bool { kind == "video" }
    /// What a tile shows: the image, or a video's poster frame.
    var thumbURL: URL? { URL(string: isVideo ? (posterUrl ?? url) : url) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case kind, url, posterUrl, rating, reviewStatus, favorite, modelLabel,
            prompt, modelId, shootId
    }
}

/// The three approval states a media item can carry.
enum ReviewStatus: String, CaseIterable, Identifiable {
    case approved, needs_changes, rejected
    var id: String { rawValue }
    var label: String {
        switch self {
        case .approved: return "Approved"
        case .needs_changes: return "Needs changes"
        case .rejected: return "Rejected"
        }
    }
    var symbol: String {
        switch self {
        case .approved: return "checkmark.circle.fill"
        case .needs_changes: return "exclamationmark.triangle.fill"
        case .rejected: return "xmark.circle.fill"
        }
    }
}
