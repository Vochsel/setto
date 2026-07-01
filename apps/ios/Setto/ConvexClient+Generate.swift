import Foundation

// Generation API helpers — shot images, variations, and image→video, mirroring
// the web app's generate.ts / videos.ts surface.

struct GenerationIdsAck: Decodable { let generationIds: [String] }
struct VideoIdAck: Decodable { let videoId: String }
struct ReplaceImageAck: Decodable { let url: String? }

extension ConvexClient {
    // MARK: Shot images

    /// Create a shot at a location. Returns the new shot id.
    func createShot(
        shootLocationId: String, name: String? = nil, modelId: String? = nil
    ) async throws -> String {
        var args: [String: Any] = ["shootLocationId": shootLocationId]
        if let name, !name.isEmpty { args["name"] = name }
        if let modelId { args["modelId"] = modelId }
        return try await call("shots:create", .mutation, args: args, as: String.self)
    }

    /// Update a shot's recipe (outfit / prompts / aspect ratio).
    func updateShot(
        id: String, outfitId: String? = nil, posePrompt: String? = nil,
        extraPrompt: String? = nil, aspectRatio: String? = nil
    ) async throws {
        var args: [String: Any] = ["id": id]
        if let outfitId { args["outfitId"] = outfitId }
        if let posePrompt, !posePrompt.isEmpty { args["posePrompt"] = posePrompt }
        if let extraPrompt, !extraPrompt.isEmpty { args["extraPrompt"] = extraPrompt }
        if let aspectRatio { args["aspectRatio"] = aspectRatio }
        try await run("shots:update", .mutation, args: args)
    }

    /// Generate image(s) for a shot (one per selected outfit variation).
    @discardableResult
    func generateShot(
        shotId: String, modelKey: String? = nil, variationIds: [String]? = nil
    ) async throws -> [String] {
        var args: [String: Any] = ["shotId": shotId]
        if let modelKey { args["modelKey"] = modelKey }
        if let variationIds { args["variationIds"] = variationIds }
        let ack = try await call(
            "generate:generateShot", .action, args: args,
            as: GenerationIdsAck.self)
        return ack.generationIds
    }

    // MARK: Variations

    /// Generate 1–4 realistic variations of an existing finished image.
    @discardableResult
    func generateVariations(
        generationId: String, prompt: String? = nil, modelKey: String? = nil,
        count: Int? = nil
    ) async throws -> [String] {
        var args: [String: Any] = ["generationId": generationId]
        if let prompt, !prompt.isEmpty { args["prompt"] = prompt }
        if let modelKey { args["modelKey"] = modelKey }
        if let count { args["count"] = count }
        let ack = try await call(
            "generate:generateVariations", .action, args: args,
            as: GenerationIdsAck.self)
        return ack.generationIds
    }

    // MARK: Image → video

    /// Kick off an image-to-video render from a source generation image.
    @discardableResult
    func generateVideo(
        generationId: String, prompt: String, modelKey: String? = nil,
        durationSeconds: Int? = nil
    ) async throws -> String {
        var args: [String: Any] = [
            "generationId": generationId, "prompt": prompt,
        ]
        if let modelKey { args["modelKey"] = modelKey }
        if let durationSeconds { args["durationSeconds"] = durationSeconds }
        let ack = try await call(
            "videos:generate", .mutation, args: args, as: VideoIdAck.self)
        return ack.videoId
    }

    // MARK: Destructive crop

    /// Replace a generation's image with a newly-uploaded (cropped) file.
    /// Returns the new playable URL.
    @discardableResult
    func replaceGenerationImage(
        generationId: String, storageId: String
    ) async throws -> String? {
        let ack = try await call(
            "generations:replaceImage", .mutation,
            args: ["id": generationId, "storageId": storageId],
            as: ReplaceImageAck.self)
        return ack.url
    }
}
