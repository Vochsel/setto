import Foundation

/// Codable views of the integrations backend (Shopify / Printify / Buffer +
/// the Store dashboard and Social calendar). Field names mirror the Convex
/// documents; Decodable ignores the extra fields Convex returns.

// MARK: - Connections

/// A client-safe connection row from `integrations:list` (no secret material).
struct Connection: Identifiable, Decodable {
    let provider: String
    let label: String?
    let status: String  // "connected" | "unverified" | "error"
    let lastError: String?
    let meta: ConnectionMeta?

    var id: String { provider }

    enum CodingKeys: String, CodingKey {
        case provider, label, status, lastError, meta
    }
}

/// The non-secret bits of a connection we display (e.g. the Shopify store host).
struct ConnectionMeta: Decodable {
    let domain: String?
}

/// Result of `integrationsNode:connect` / `integrationsNode:test`.
struct VerifyResult: Decodable {
    let ok: Bool
    let label: String?
    let error: String?
}

/// The three providers a user can connect, with their UI copy + which extra
/// fields the connect form needs beyond the secret token.
enum IntegrationProvider: String, CaseIterable, Identifiable {
    case shopify, printify, buffer
    var id: String { rawValue }

    var title: String {
        switch self {
        case .shopify: return "Shopify"
        case .printify: return "Printify"
        case .buffer: return "Buffer"
        }
    }
    var blurb: String {
        switch self {
        case .shopify: return "Sync your product wardrobe"
        case .printify: return "Production costs, orders & shipping"
        case .buffer: return "Schedule posts to Instagram & more"
        }
    }
    var symbol: String {
        switch self {
        case .shopify: return "bag.fill"
        case .printify: return "shippingbox.fill"
        case .buffer: return "paperplane.fill"
        }
    }
    /// The label for the secret field (each provider calls its token differently).
    var secretLabel: String {
        switch self {
        case .shopify: return "Admin API access token"
        case .printify: return "API token"
        case .buffer: return "Access token"
        }
    }
    /// Shopify also needs its store domain (stored in `meta.domain`).
    var needsDomain: Bool { self == .shopify }
    /// Shopify authenticates via the Setto app's server-side credentials, so it
    /// has no user-pasted secret — the connect form asks only for the domain.
    var needsSecret: Bool { self != .shopify }
}

// MARK: - Store (Printify)

/// `printify:summary` — the Store dashboard rollup (money fields are minor units).
struct StoreSummary: Decodable {
    let productCount: Int
    let orderCount: Int
    let openOrders: Int
    let revenue: Int
    let productionCost: Int
    let margin: Int
    let currency: String?
}

/// A cached Printify product (`printify:products`).
struct StoreProduct: Identifiable, Decodable {
    let id: String
    let title: String
    let images: [String]?
    let cost: Int?
    let price: Int?
    let currency: String?

    var thumbURL: URL? { URL(string: images?.first ?? "") }
    var margin: Int? {
        guard let price, let cost else { return nil }
        return price - cost
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case title, images, cost, price, currency
    }
}

/// A cached Printify order (`printify:orders`).
struct StoreOrder: Identifiable, Decodable {
    let id: String
    let orderId: String
    let status: String?
    let totalPrice: Int?
    let productionCost: Int?
    let currency: String?
    let address: Address?
    let shipments: [Shipment]?
    let placedAt: String?

    var shipment: Shipment? { shipments?.first }
    var destination: String? {
        guard let city = address?.city else { return nil }
        return [city, address?.country].compactMap { $0 }.joined(separator: ", ")
    }

    struct Address: Decodable {
        let city: String?
        let region: String?
        let country: String?
    }
    struct Shipment: Decodable {
        let carrier: String?
        let number: String?
        let url: String?
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case orderId, status, totalPrice, productionCost, currency, address,
            shipments, placedAt
    }
}

// MARK: - Social (Buffer)

/// One picked image/video attached to a post. Codable so it round-trips into the
/// mutation args as a plain dictionary too (see `dict`).
struct SocialMedia: Codable, Hashable, Identifiable {
    let type: String  // "image" | "video"
    let url: String
    let thumbnailUrl: String?

    var id: String { url }
    var isVideo: Bool { type == "video" }
    var thumbURL: URL? { URL(string: thumbnailUrl ?? url) }

    /// The shape the Convex mutations expect for a media entry.
    var dict: [String: Any] {
        var d: [String: Any] = ["type": type, "url": url]
        if let thumbnailUrl { d["thumbnailUrl"] = thumbnailUrl }
        return d
    }
}

/// A social post record (`social:posts`).
struct SocialPost: Identifiable, Decodable {
    let id: String
    let text: String
    let media: [SocialMedia]
    let channelIds: [String]
    let scheduledAt: Double?  // epoch ms
    let status: String  // "draft" | "sent" | "error" | ...
    let error: String?

    var isSent: Bool { status == "sent" }
    var scheduledDate: Date? {
        guard let scheduledAt else { return nil }
        return Date(timeIntervalSince1970: scheduledAt / 1000)
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case text, media, channelIds, scheduledAt, status, error
    }
}

/// A connected Buffer channel (`socialNode:channels`).
struct SocialChannel: Identifiable, Decodable {
    let id: String
    let name: String?
    let service: String?

    var label: String { name ?? service ?? id }
}

/// Result of `socialNode:schedule` / `socialNode:publish`.
struct ScheduleResult: Decodable {
    let ok: Bool
    let error: String?
}

/// Workspace settings (`settings:get`) — we read the scheduling timezone.
struct WorkspaceSettings: Decodable {
    let timezone: String?
    let defaultImageModelKey: String?
}
