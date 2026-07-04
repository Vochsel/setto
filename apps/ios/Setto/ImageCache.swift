import CryptoKit
import ImageIO
import SwiftUI
import UIKit

/// Shared, downsampling image cache that backs `CachedAsyncImage`.
///
/// SwiftUI's `AsyncImage` keeps no cache, so every media tile re-downloads its
/// image each time it appears — on scroll recycling, tab switches, and relaunch.
/// The gallery's images are full-resolution Convex-storage files (often several
/// MB each), which is the main reason the grid felt slow. This loader fixes that
/// by:
///   • decoding straight to a downsampled bitmap sized for the slot (small and
///     fast) and holding it in an in-memory `NSCache` for instant redisplay,
///   • persisting the original bytes under Caches/ so images survive relaunch
///     and are never downloaded twice,
///   • coalescing concurrent requests for the same URL+size into one download.
actor ImageLoader {
    static let shared = ImageLoader()

    private let memory = NSCache<NSString, UIImage>()
    private let session: URLSession
    private let diskDir: URL
    private var inFlight: [String: Task<UIImage, Error>] = [:]

    init() {
        memory.countLimit = 400
        memory.totalCostLimit = 128 << 20  // ~128 MB of decoded bitmaps

        let cfg = URLSessionConfiguration.default
        cfg.urlCache = URLCache(memoryCapacity: 16 << 20, diskCapacity: 256 << 20)
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        cfg.timeoutIntervalForRequest = 30
        session = URLSession(configuration: cfg)

        let caches = FileManager.default.urls(
            for: .cachesDirectory, in: .userDomainMask)[0]
        diskDir = caches.appendingPathComponent(
            "SettoImageCache", isDirectory: true)
        try? FileManager.default.createDirectory(
            at: diskDir, withIntermediateDirectories: true)
    }

    /// A downsampled image for `url`, capped to `maxPixel` on its longest edge.
    /// Served from memory, then disk, then network — whichever hits first. The
    /// actor only coordinates (cache lookup + in-flight dedup); the download and
    /// decode run off-actor so they never block other lookups.
    func image(for url: URL, maxPixel: CGFloat) async throws -> UIImage {
        let key = "\(url.absoluteString)|\(Int(maxPixel))"
        if let hit = memory.object(forKey: key as NSString) { return hit }
        if let task = inFlight[key] { return try await task.value }

        let task = Task<UIImage, Error> {
            try await self.loadImage(from: url, maxPixel: maxPixel)
        }
        inFlight[key] = task
        defer { inFlight[key] = nil }

        let image = try await task.value
        memory.setObject(image, forKey: key as NSString, cost: image.byteCost)
        return image
    }

    /// Fetch (disk, else network) and downsample — all off the actor.
    private nonisolated func loadImage(
        from url: URL, maxPixel: CGFloat
    ) async throws -> UIImage {
        let data = try await bytes(for: url)
        guard let image = Self.downsample(data, maxPixel: maxPixel) else {
            throw URLError(.cannotDecodeContentData)
        }
        return image
    }

    /// Original bytes for `url`: the on-disk copy if present, else download it
    /// once and persist it so later launches skip the network entirely. Reads
    /// only immutable state, so it's `nonisolated` and runs off the actor.
    private nonisolated func bytes(for url: URL) async throws -> Data {
        let file = diskDir.appendingPathComponent(Self.filename(for: url))
        if let data = try? Data(contentsOf: file) { return data }
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw URLError(.badServerResponse)
        }
        try? data.write(to: file, options: .atomic)
        return data
    }

    /// Decode `data` directly into a thumbnail no larger than `maxPixel` px —
    /// the full-resolution bitmap is never materialized, which keeps memory and
    /// decode time low even for large source images.
    nonisolated static func downsample(
        _ data: Data, maxPixel: CGFloat
    ) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard
            let source = CGImageSourceCreateWithData(data as CFData, sourceOptions)
        else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(maxPixel, 1),
        ]
        guard
            let cg = CGImageSourceCreateThumbnailAtIndex(
                source, 0, options as CFDictionary)
        else { return nil }
        return UIImage(cgImage: cg)
    }

    private static func filename(for url: URL) -> String {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

extension UIImage {
    /// Rough decoded-bitmap size in bytes, used for `NSCache` cost accounting.
    fileprivate var byteCost: Int {
        guard let cg = cgImage else { return 0 }
        return cg.bytesPerRow * cg.height
    }
}

/// Drop-in, caching replacement for `AsyncImage(url:) { phase in … }`. Mirrors
/// the same `AsyncImagePhase` closure so call sites keep their switch untouched,
/// but loads through `ImageLoader` (memory + disk cache, downsampled decode).
///
/// `maxWidth` is the point width of the slot the image fills; the loader
/// downsamples to that width in device pixels. Grid tiles can leave the default;
/// full-screen surfaces pass a larger value.
struct CachedAsyncImage<Content: View>: View {
    private let url: URL?
    private let maxWidth: CGFloat
    private let content: (AsyncImagePhase) -> Content

    @Environment(\.displayScale) private var displayScale
    @State private var phase: AsyncImagePhase = .empty

    init(
        url: URL?,
        maxWidth: CGFloat = 512,
        @ViewBuilder content: @escaping (AsyncImagePhase) -> Content
    ) {
        self.url = url
        self.maxWidth = maxWidth
        self.content = content
    }

    var body: some View {
        content(phase)
            .task(id: taskKey) { await load() }
    }

    /// Re-run the load when the URL or the target pixel size changes.
    private var taskKey: String {
        "\(url?.absoluteString ?? "")|\(Int(maxWidth * displayScale))"
    }

    private func load() async {
        guard let url else {
            phase = .empty
            return
        }
        let maxPixel = max(maxWidth * displayScale, 1)
        do {
            let image = try await ImageLoader.shared.image(
                for: url, maxPixel: maxPixel)
            phase = .success(Image(uiImage: image))
        } catch {
            phase = .failure(error)
        }
    }
}
