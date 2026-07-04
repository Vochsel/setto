import Foundation

/// Integration calls: connections (Shopify/Printify/Buffer), the Store
/// dashboard, and the Social calendar. Thin wrappers over `ConvexClient.call`.
extension ConvexClient {

    // MARK: Connections

    func connections() async throws -> [Connection] {
        try await call("integrations:list", .query, as: [Connection].self)
    }

    /// Encrypt + store + verify a provider's secret. `meta` carries non-secret
    /// config (e.g. Shopify `domain`). Returns the verification result.
    func connect(
        provider: String, secret: String, meta: [String: Any] = [:]
    ) async throws -> VerifyResult {
        try await call(
            "integrationsNode:connect", .action,
            args: ["provider": provider, "secret": secret, "meta": meta],
            as: VerifyResult.self)
    }

    func testConnection(_ provider: String) async throws -> VerifyResult {
        try await call(
            "integrationsNode:test", .action,
            args: ["provider": provider], as: VerifyResult.self)
    }

    func disconnect(_ provider: String) async throws {
        try await run("integrations:disconnect", args: ["provider": provider])
    }

    // MARK: Store (Printify + Shopify)

    /// Optional because the backend returns null-ish rollups before any sync.
    func storeSummary() async throws -> StoreSummary? {
        try await call("printify:summary", .query, as: StoreSummary?.self)
    }

    func storeProducts() async throws -> [StoreProduct] {
        try await call("printify:products", .query, as: [StoreProduct].self)
    }

    func storeOrders(limit: Int = 25) async throws -> [StoreOrder] {
        try await call(
            "printify:orders", .query, args: ["limit": limit],
            as: [StoreOrder].self)
    }

    func syncShopify() async throws {
        try await run("shopify:sync", .action)
    }

    func syncPrintify() async throws {
        try await run("printifyNode:sync", .action)
    }

    // MARK: Social (Buffer)

    func socialPosts() async throws -> [SocialPost] {
        try await call("social:posts", .query, as: [SocialPost].self)
    }

    func socialChannels() async throws -> [SocialChannel] {
        try await call(
            "socialNode:channels", .action, as: [SocialChannel].self)
    }

    @discardableResult
    func saveDraft(
        text: String, media: [SocialMedia], channelIds: [String],
        scheduledAt: Double?
    ) async throws -> String {
        var args: [String: Any] = [
            "text": text,
            "media": media.map(\.dict),
            "channelIds": channelIds,
        ]
        if let scheduledAt { args["scheduledAt"] = scheduledAt }
        return try await call(
            "social:saveDraft", .mutation, args: args, as: String.self)
    }

    func updatePost(
        id: String, text: String, media: [SocialMedia], channelIds: [String],
        scheduledAt: Double?
    ) async throws {
        try await run(
            "social:update", .mutation,
            args: [
                "id": id, "text": text, "media": media.map(\.dict),
                "channelIds": channelIds,
                "scheduledAt": scheduledAt ?? NSNull(),
            ])
    }

    func addMedia(id: String, media: [SocialMedia]) async throws {
        try await run(
            "social:addMedia", .mutation,
            args: ["id": id, "media": media.map(\.dict)])
    }

    func removePost(id: String) async throws {
        try await run("social:remove", .mutation, args: ["id": id])
    }

    /// Compose + push a brand-new post to Buffer (schedules if `scheduledAt` set).
    func schedulePost(
        text: String, media: [SocialMedia], channelIds: [String],
        scheduledAt: Double?
    ) async throws -> ScheduleResult {
        var args: [String: Any] = [
            "text": text,
            "media": media.map(\.dict),
            "channelIds": channelIds,
        ]
        if let scheduledAt { args["scheduledAt"] = scheduledAt }
        return try await call(
            "socialNode:schedule", .action, args: args, as: ScheduleResult.self)
    }

    /// Push an already-saved post to Buffer.
    func publishPost(id: String) async throws -> ScheduleResult {
        try await call(
            "socialNode:publish", .action, args: ["id": id],
            as: ScheduleResult.self)
    }

    // MARK: Settings

    func workspaceSettings() async throws -> WorkspaceSettings {
        try await call("settings:get", .query, as: WorkspaceSettings.self)
    }

    func setTimezone(_ tz: String) async throws {
        try await run("settings:setTimezone", .mutation, args: ["timezone": tz])
    }
}

// MARK: - Formatting helpers

/// Format a minor-unit (cents) amount as currency, e.g. 1299 → "$12.99".
func money(_ minor: Int?, currency: String? = "USD") -> String {
    guard let minor else { return "—" }
    let fmt = NumberFormatter()
    fmt.numberStyle = .currency
    fmt.currencyCode = currency ?? "USD"
    return fmt.string(from: NSNumber(value: Double(minor) / 100)) ?? "—"
}
