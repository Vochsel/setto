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

    // MARK: Clip motion + transitions (simple-arg)

    func setClipTransition(
        projectId: String, clipId: String, type: String, durationMs: Double
    ) async throws {
        try await run(
            "videoProjects:setClipTransition", .mutation,
            args: [
                "projectId": projectId, "clipId": clipId, "type": type,
                "durationMs": durationMs,
            ])
    }

    func setClipKenBurnsControls(
        projectId: String, clipId: String, direction: String,
        focusX: Double, focusY: Double, zoom: Double
    ) async throws {
        try await run(
            "videoProjects:setClipKenBurnsControls", .mutation,
            args: [
                "projectId": projectId, "clipId": clipId,
                "direction": direction, "focusX": focusX, "focusY": focusY,
                "zoom": zoom,
            ])
    }

    // MARK: Add motion clips + source lists

    func addVideos(projectId: String, videoIds: [String]) async throws {
        try await run(
            "videoProjects:addVideos", .mutation,
            args: ["projectId": projectId, "videoIds": videoIds])
    }

    /// Finished motion clips to pick from when adding clips.
    func listSourceVideos() async throws -> [VideoSourceVideo] {
        try await call(
            "videos:listByOrg", .query, as: [VideoSourceVideo].self)
    }

    // MARK: Background / stack settings

    /// Set the background to a color, gradient, or image URL — clears the others.
    func setProjectBackground(
        projectId: String, color: String? = nil, gradient: String? = nil,
        imageUrl: String? = nil
    ) async throws {
        try await run(
            "videoProjects:updateSettings", .mutation,
            args: [
                "projectId": projectId,
                "background": color ?? NSNull(),
                "backgroundGradient": gradient ?? NSNull(),
                "backgroundImageUrl": imageUrl ?? NSNull(),
            ])
    }

    func setStackSettings(
        projectId: String, staggerMs: Int? = nil, animate: Bool? = nil
    ) async throws {
        var args: [String: Any] = ["projectId": projectId]
        if let staggerMs { args["stackStaggerMs"] = staggerMs }
        if let animate { args["stackAnimate"] = animate }
        try await run("videoProjects:updateSettings", .mutation, args: args)
    }

    // MARK: Audio library

    func listAudioTracks() async throws -> [AudioTrackDoc] {
        try await call("audioTracks:list", .query, as: [AudioTrackDoc].self)
    }

    /// Persist a freshly-uploaded audio file to the library. Returns the row.
    func createAudioTrack(storageId: String, name: String) async throws
        -> AudioTrackDoc
    {
        try await call(
            "audioTracks:create", .mutation,
            args: ["storageId": storageId, "name": name], as: AudioTrackDoc.self)
    }

    func setProjectAudio(
        projectId: String, url: String, name: String?, trackId: String?
    ) async throws {
        var audio: [String: Any] = ["url": url, "volume": 1]
        if let name { audio["name"] = name }
        if let trackId { audio["trackId"] = trackId }
        try await run(
            "videoProjects:updateSettings", .mutation,
            args: ["projectId": projectId, "audio": audio])
    }

    func clearProjectAudio(projectId: String) async throws {
        try await run(
            "videoProjects:updateSettings", .mutation,
            args: ["projectId": projectId, "audio": NSNull()])
    }

    /// Resolve a stored file (uploaded audio/image) to a playable URL.
    func fileURL(storageId: String) async throws -> String? {
        try await call(
            "files:getUrl", .query, args: ["storageId": storageId],
            as: String?.self)
    }
}
