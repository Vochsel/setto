import Foundation

// Swift mirror of the `@setto/core/video` spec + the Convex video tables.
// Read-only decoding here; edits go through simple-arg Convex mutations
// (reorderClips / setClipDuration / removeClip / setClipKenBurns / …) so we
// never have to re-encode whole clip objects from the client.

/// A card in the video-projects list.
struct VideoProjectCard: Identifiable, Decodable, Equatable {
    let id: String
    let name: String
    let templateId: String
    let width: Int
    let height: Int
    let fps: Int
    let clipCount: Int
    let durationMs: Double
    let posterUrl: String?

    var thumbURL: URL? { posterUrl.flatMap(URL.init(string:)) }
    var durationLabel: String { formatDuration(durationMs) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, templateId, width, height, fps, clipCount, durationMs,
            posterUrl
    }
}

/// Friendly view of a Ken Burns move (mirrors kenBurnsControls in core).
struct KenBurnsControls: Equatable {
    var direction: String  // "in" | "out"
    var focusX: Double
    var focusY: Double
    var zoom: Double
}

struct VideoEffect: Decodable, Equatable {
    let type: String  // "none" | "kenburns"
    let fromScale: Double?
    let toScale: Double?
    let fromX: Double?
    let fromY: Double?
    let toX: Double?
    let toY: Double?

    /// Decode this effect into direction / focal / zoom for the editor.
    var controls: KenBurnsControls {
        guard type == "kenburns" else {
            return .init(direction: "in", focusX: 0, focusY: 0, zoom: 1.18)
        }
        let from = fromScale ?? 1
        let to = toScale ?? 1
        if to >= from {
            return .init(
                direction: "in", focusX: toX ?? 0, focusY: toY ?? 0, zoom: to)
        }
        return .init(
            direction: "out", focusX: fromX ?? 0, focusY: fromY ?? 0, zoom: from)
    }
}

struct VideoTransition: Decodable, Equatable {
    let type: String
    let durationMs: Double
}

/// A single clip on the timeline.
struct VideoClip: Identifiable, Decodable, Equatable {
    let id: String
    let sourceType: String  // "image" | "video"
    let url: String
    let posterUrl: String?
    let durationMs: Double
    let effect: VideoEffect?
    let transition: VideoTransition?
    let caption: String?

    var isVideo: Bool { sourceType == "video" }
    var kenBurns: Bool { effect?.type == "kenburns" }
    var thumbURL: URL? {
        URL(string: isVideo ? (posterUrl ?? url) : url)
    }
}

struct VideoAudio: Decodable, Equatable {
    let url: String
    let name: String?
    let trackId: String?
}

/// A full project with its editable spec.
struct VideoProject: Identifiable, Decodable, Equatable {
    let id: String
    let name: String
    let shootId: String?
    let templateId: String
    let width: Int
    let height: Int
    let fps: Int
    let clips: [VideoClip]
    let audio: VideoAudio?
    let background: String?
    let backgroundGradient: String?
    let backgroundImageUrl: String?
    let stackStaggerMs: Double?
    let stackAnimate: Bool?

    var isStack: Bool { templateId == "stack" }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, shootId, templateId, width, height, fps, clips, audio,
            background, backgroundGradient, backgroundImageUrl, stackStaggerMs,
            stackAnimate
    }
}

/// An uploaded background track from the workspace audio library.
struct AudioTrackDoc: Identifiable, Decodable, Equatable {
    let id: String
    let name: String
    let url: String?
    let durationMs: Double?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, url, durationMs
    }
}

/// An export job.
struct VideoRender: Identifiable, Decodable, Equatable {
    let id: String
    let status: String  // queued | rendering | succeeded | failed
    let progress: Double?
    let progressLabel: String?
    let outputUrl: String?
    let error: String?

    var outputURL: URL? { outputUrl.flatMap(URL.init(string:)) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case status, progress, progressLabel, outputUrl, error
    }
}

/// A pickable source image (for "Add clips"). Carries the filterable snapshot
/// fields (model / outfit / favorite) so the picker can narrow the library.
struct VideoSourceImage: Identifiable, Decodable, Equatable {
    let id: String
    let imageUrl: String?
    let shootId: String?
    let modelId: String?
    let outfitId: String?
    let favorite: Bool?

    var thumbURL: URL? { imageUrl.flatMap(URL.init(string:)) }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case imageUrl, shootId, modelId, outfitId, favorite
    }
}

/// A pickable source motion clip (for "Add clips" → Motion tab).
struct VideoSourceVideo: Identifiable, Decodable, Equatable {
    let id: String
    let videoUrl: String?
    let posterUrl: String?
    let shootId: String?
    let modelId: String?
    let favorite: Bool?

    var thumbURL: URL? {
        (posterUrl ?? videoUrl).flatMap(URL.init(string:))
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case videoUrl, posterUrl, shootId, modelId, favorite
    }
}

struct CreateProjectAck: Decodable { let projectId: String }
struct StartRenderAck: Decodable { let renderId: String }

// MARK: - Presets (mirror of @setto/core/video)

struct VideoTemplateInfo: Identifiable {
    let id: String
    let name: String
    let emoji: String
}

let videoTemplates: [VideoTemplateInfo] = [
    .init(id: "slideshow", name: "Slideshow", emoji: "🖼️"),
    .init(id: "kenburns", name: "Ken Burns", emoji: "🎞️"),
    .init(id: "reel", name: "Video Reel", emoji: "🎬"),
    .init(id: "fastcuts", name: "Fast Cuts", emoji: "⚡"),
    .init(id: "cinematic", name: "Cinematic", emoji: "🎥"),
    .init(id: "stack", name: "Photo Stack", emoji: "🗂️"),
]

struct VideoResolutionInfo: Identifiable {
    let id: String  // "WxH"
    let label: String
    let width: Int
    let height: Int
}

let videoResolutions: [VideoResolutionInfo] = [
    .init(id: "1080x1920", label: "1080×1920 · 9:16", width: 1080, height: 1920),
    .init(id: "1080x1350", label: "1080×1350 · 4:5", width: 1080, height: 1350),
    .init(id: "1080x1080", label: "1080×1080 · 1:1", width: 1080, height: 1080),
    .init(id: "1920x1080", label: "1920×1080 · 16:9", width: 1920, height: 1080),
    .init(id: "2160x3840", label: "2160×3840 · 4K", width: 2160, height: 3840),
]

let videoFpsOptions: [Int] = [24, 30, 60]

/// Format a millisecond duration as m:ss or s.s.
func formatDuration(_ ms: Double) -> String {
    let secs = ms / 1000
    if secs < 60 { return String(format: "%.1fs", secs) }
    let m = Int(secs) / 60
    let s = Int(secs) % 60
    return String(format: "%d:%02d", m, s)
}
