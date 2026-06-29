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

struct ModelDoc: Identifiable, Decodable {
    let id: String
    let name: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name
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

    var isVideo: Bool { kind == "video" }
    /// What a tile shows: the image, or a video's poster frame.
    var thumbURL: URL? { URL(string: isVideo ? (posterUrl ?? url) : url) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case kind, url, posterUrl, rating, reviewStatus, favorite, modelLabel,
            prompt
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
