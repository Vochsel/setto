import Foundation

// Video/clips API helpers over the minimal Convex HTTP client.
extension ConvexClient {
    // MARK: Reads

    func listVideoProjects() async throws -> [VideoProjectCard] {
        try await call("videoProjects:list", .query, as: [VideoProjectCard].self)
    }

    func getVideoProject(_ id: String) async throws -> VideoProject {
        try await call(
            "videoProjects:get", .query, args: ["id": id], as: VideoProject.self)
    }

    func listRenders(projectId: String) async throws -> [VideoRender] {
        try await call(
            "videoRenders:listByProject", .query,
            args: ["projectId": projectId], as: [VideoRender].self)
    }

    /// Finished images to pick from when adding clips.
    func listSourceImages() async throws -> [VideoSourceImage] {
        try await call(
            "generations:listByOrg", .query, as: [VideoSourceImage].self)
    }

    // MARK: Create

    func createVideoProject(
        templateId: String? = nil, shootId: String? = nil
    ) async throws -> String {
        var args: [String: Any] = [:]
        if let templateId { args["templateId"] = templateId }
        if let shootId { args["shootId"] = shootId }
        let ack = try await call(
            "videoProjects:create", .mutation, args: args,
            as: CreateProjectAck.self)
        return ack.projectId
    }

    func createVideoFromShots(
        shotIds: [String], templateId: String? = nil, shootId: String? = nil
    ) async throws -> String {
        var args: [String: Any] = ["shotIds": shotIds]
        if let templateId { args["templateId"] = templateId }
        if let shootId { args["shootId"] = shootId }
        let ack = try await call(
            "videoProjects:createFromShots", .mutation, args: args,
            as: CreateProjectAck.self)
        return ack.projectId
    }

    func createVideoFromGenerations(
        generationIds: [String], templateId: String? = nil,
        shootId: String? = nil
    ) async throws -> String {
        var args: [String: Any] = ["generationIds": generationIds]
        if let templateId { args["templateId"] = templateId }
        if let shootId { args["shootId"] = shootId }
        let ack = try await call(
            "videoProjects:createFromGenerations", .mutation, args: args,
            as: CreateProjectAck.self)
        return ack.projectId
    }

    // MARK: Edit (simple-arg clip ops)

    func reorderClips(projectId: String, clipIds: [String]) async throws {
        try await run(
            "videoProjects:reorderClips", .mutation,
            args: ["projectId": projectId, "clipIds": clipIds])
    }

    func setClipDuration(
        projectId: String, clipId: String, durationMs: Double
    ) async throws {
        try await run(
            "videoProjects:setClipDuration", .mutation,
            args: [
                "projectId": projectId, "clipId": clipId,
                "durationMs": durationMs,
            ])
    }

    func removeClip(projectId: String, clipId: String) async throws {
        try await run(
            "videoProjects:removeClip", .mutation,
            args: ["projectId": projectId, "clipId": clipId])
    }

    func setClipKenBurns(
        projectId: String, clipId: String, enabled: Bool
    ) async throws {
        try await run(
            "videoProjects:setClipKenBurns", .mutation,
            args: [
                "projectId": projectId, "clipId": clipId, "enabled": enabled,
            ])
    }

    func addGenerations(
        projectId: String, generationIds: [String]
    ) async throws {
        try await run(
            "videoProjects:addGenerations", .mutation,
            args: ["projectId": projectId, "generationIds": generationIds])
    }

    func updateVideoSettings(
        projectId: String, templateId: String? = nil,
        width: Int? = nil, height: Int? = nil, fps: Int? = nil
    ) async throws {
        var args: [String: Any] = ["projectId": projectId]
        if let templateId { args["templateId"] = templateId }
        if let width { args["width"] = width }
        if let height { args["height"] = height }
        if let fps { args["fps"] = fps }
        try await run("videoProjects:updateSettings", .mutation, args: args)
    }

    func renameVideoProject(projectId: String, name: String) async throws {
        try await run(
            "videoProjects:rename", .mutation,
            args: ["projectId": projectId, "name": name])
    }

    func removeVideoProject(_ id: String) async throws {
        try await run(
            "videoProjects:remove", .mutation, args: ["id": id])
    }

    // MARK: Export

    func startRender(projectId: String) async throws -> String {
        let ack = try await call(
            "videoRenders:start", .mutation,
            args: ["projectId": projectId], as: StartRenderAck.self)
        return ack.renderId
    }
}
