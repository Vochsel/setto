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
