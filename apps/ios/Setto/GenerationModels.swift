import Foundation

// Swift mirrors of the web generation registries (lib/imageModels.ts,
// lib/videoModels.ts) + the video-editor presets from @setto/core/video.

// MARK: - Image models (shot generation + variations)

struct ImageGenModel: Identifiable, Hashable {
    let id: String  // modelKey passed to generate:*
    let label: String
    let price: Double
}

/// Curated image models offered for generating shots (default first).
let imageGenModels: [ImageGenModel] = [
    .init(id: "google/gemini-2.5-flash-image", label: "Nano Banana 2.5 Flash", price: 0.039),
    .init(id: "google/gemini-3-pro-image-preview", label: "Nano Banana Pro", price: 0.134),
    .init(id: "google/gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite", price: 0.034),
    .init(id: "openai/gpt-image-2", label: "GPT Image 2", price: 0.25),
]

let defaultImageGenModelId = "google/gemini-2.5-flash-image"

// MARK: - Video models (image → video)

struct VideoGenModel: Identifiable, Hashable {
    let id: String
    let label: String
    let durations: [Int]
    let defaultDuration: Int
}

let videoGenModels: [VideoGenModel] = [
    .init(
        id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
        label: "Kling 2.5 Turbo Pro", durations: [5, 10], defaultDuration: 5),
    .init(
        id: "fal-ai/pixverse/v4.5/image-to-video",
        label: "PixVerse v4.5", durations: [5, 8], defaultDuration: 5),
    .init(
        id: "fal-ai/minimax/hailuo-02/standard/image-to-video",
        label: "MiniMax Hailuo 02", durations: [6, 10], defaultDuration: 6),
    .init(
        id: "fal-ai/luma-dream-machine/ray-2/image-to-video",
        label: "Luma Ray 2", durations: [5, 9], defaultDuration: 5),
    .init(
        id: "fal-ai/veo3/fast/image-to-video",
        label: "Veo 3 Fast", durations: [8], defaultDuration: 8),
]

let defaultVideoGenModelId = "fal-ai/kling-video/v2.5-turbo/pro/image-to-video"

// MARK: - Video-editor presets

struct TransitionOption: Identifiable, Hashable {
    let id: String  // "none" | "fade" | "dissolve" | "slide" | "wipe"
    let label: String
}

let transitionOptions: [TransitionOption] = [
    .init(id: "none", label: "Cut (none)"),
    .init(id: "fade", label: "Fade"),
    .init(id: "dissolve", label: "Dissolve"),
    .init(id: "slide", label: "Slide"),
    .init(id: "wipe", label: "Wipe"),
]

struct GradientPreset: Identifiable, Hashable {
    let id: String
    let label: String
    let css: String  // the CSS string persisted to backgroundGradient
    let colors: [UInt32]  // for the SwiftUI swatch preview
}

/// Mirror of BACKGROUND_GRADIENTS in @setto/core/video (css must match exactly
/// so the render honours the selection).
let gradientPresets: [GradientPreset] = [
    .init(id: "sunset", label: "Sunset", css: "linear-gradient(135deg, #f97316 0%, #db2777 100%)", colors: [0xf97316, 0xdb2777]),
    .init(id: "ocean", label: "Ocean", css: "linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)", colors: [0x0ea5e9, 0x4f46e5]),
    .init(id: "mint", label: "Mint", css: "linear-gradient(135deg, #34d399 0%, #0f766e 100%)", colors: [0x34d399, 0x0f766e]),
    .init(id: "grape", label: "Grape", css: "linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)", colors: [0x8b5cf6, 0xd946ef]),
    .init(id: "peach", label: "Peach", css: "linear-gradient(135deg, #fda4af 0%, #fdba74 100%)", colors: [0xfda4af, 0xfdba74]),
    .init(id: "gold", label: "Gold", css: "linear-gradient(135deg, #fbbf24 0%, #b45309 100%)", colors: [0xfbbf24, 0xb45309]),
    .init(id: "slate", label: "Slate", css: "linear-gradient(160deg, #334155 0%, #0f172a 100%)", colors: [0x334155, 0x0f172a]),
    .init(id: "noir", label: "Noir", css: "linear-gradient(180deg, #1f2937 0%, #000000 100%)", colors: [0x1f2937, 0x000000]),
]

/// Solid background swatches (hex strings persisted to `background`).
let backgroundColors: [String] = [
    "#000000", "#111111", "#1e293b", "#0f172a", "#ffffff",
    "#7c3aed", "#db2777", "#0ea5e9", "#f59e0b", "#10b981",
]
