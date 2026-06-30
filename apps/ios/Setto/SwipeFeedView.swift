import AVKit
import SwiftUI
import UIKit

/// A full-screen, TikTok-style vertical pager over a list of media. Each page
/// fills the screen; images and (looping, auto-playing) videos both render edge
/// to edge with a review rail overlaid — favorite, 1–5 rating and approval
/// status, all written straight back through `review:*`.
///
/// The feed mutates the bound `items` in place (optimistically), so whatever
/// presented it — a gallery, favorites, a single shoot — stays in sync.
struct SwipeFeedView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @Binding var items: [MediaItem]
    var startId: String?

    @State private var currentId: String?
    /// Urls we've already warmed so we don't refetch them.
    @State private var prefetched: Set<String> = []
    /// Live translation while back-swiping the reel away from the left edge.
    @State private var dismissOffset: CGFloat = 0

    var body: some View {
        // NOTE: the dismiss offset is applied with `.offset` (layout-neutral) and
        // never with `.scaleEffect` — scaling a paging ScrollView breaks its
        // scroll/paging gesture, which had killed the vertical swipe.
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach($items) { $item in
                    MediaPage(item: $item, isActive: currentId == item.id)
                        .environmentObject(auth)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(item.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentId)
        .ignoresSafeArea()
        .background(.black)
        .overlay(alignment: .topLeading) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(.black.opacity(0.35), in: Circle())
            }
            .padding(.leading, 20)
            .padding(.top, 8)
        }
        // Slide the whole reel with the back-swipe; a static black backdrop
        // (applied after the offset, so it stays put) fills the revealed gap.
        .offset(x: dismissOffset)
        .background(Color.black.ignoresSafeArea())
        .overlay(alignment: .leading) { edgeSwipeCatcher }
        .statusBarHidden()
        .onAppear {
            currentId = startId ?? items.first?.id
            prefetchAhead()
        }
        .onChange(of: currentId) { _, _ in prefetchAhead() }
    }

    /// A thin strip on the left edge that turns a rightward back-swipe into an
    /// interactive dismiss — drag the reel away and release past the threshold
    /// to pop back to wherever you came from, or let go to spring it back.
    private var edgeSwipeCatcher: some View {
        Color.clear
            .frame(width: 24)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .ignoresSafeArea()
            .gesture(
                DragGesture(minimumDistance: 12)
                    .onChanged { value in
                        dismissOffset = max(0, value.translation.width)
                    }
                    .onEnded { value in
                        let pulledFar = value.translation.width > 120
                        let flicked = value.predictedEndTranslation.width > 300
                        if pulledFar || flicked {
                            dismiss()
                        } else {
                            withAnimation(
                                .spring(response: 0.3, dampingFraction: 0.85)
                            ) {
                                dismissOffset = 0
                            }
                        }
                    }
            )
    }

    /// Warm the URL cache for the next three items so they appear instantly as
    /// you swipe through the reel.
    private func prefetchAhead() {
        guard let currentId,
            let idx = items.firstIndex(where: { $0.id == currentId })
        else { return }
        let upper = min(idx + 4, items.count)
        guard idx + 1 < upper else { return }
        for item in items[(idx + 1)..<upper] where !prefetched.contains(item.id) {
            prefetched.insert(item.id)
            // For videos warm the poster frame; for images the image itself.
            let raw = item.isVideo ? (item.posterUrl ?? item.url) : item.url
            guard let url = URL(string: raw) else { continue }
            Task.detached(priority: .background) {
                _ = try? await URLSession.shared.data(from: url)
            }
        }
    }
}

/// A single full-screen media page: the image/video plus the review overlay.
private struct MediaPage: View {
    @EnvironmentObject var auth: AuthStore
    @Binding var item: MediaItem
    let isActive: Bool

    // Live "peek" transform driven by a two-finger pinch (zoom + rotate + pan),
    // anchored at where the pinch began. Springs back to identity on release.
    @State private var scale: CGFloat = 1
    @State private var rotation: Angle = .zero
    @State private var offset: CGSize = .zero
    @State private var anchor: UnitPoint = .center
    @State private var saveState: MediaSaveState = .idle

    private var client: ConvexClient {
        ConvexClient(baseURL: Config.convexURL, token: auth.validToken())
    }

    var body: some View {
        ZStack {
            Color.black
            media
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .scaleEffect(scale, anchor: anchor)
                .rotationEffect(rotation, anchor: anchor)
                .offset(offset)
                .contentShape(Rectangle())
                .simultaneousGesture(peekGesture)
            overlay
        }
        .clipped()
        .contentShape(Rectangle())
    }

    /// Combined magnify + rotate + drag. Pan only engages once a pinch is active
    /// so a one-finger swipe still pages the feed. On end, spring back.
    private var peekGesture: some Gesture {
        let combined = SimultaneousGesture(
            SimultaneousGesture(MagnifyGesture(), RotateGesture()),
            DragGesture(minimumDistance: 0))
        return combined
            .onChanged { value in
                let magnify = value.first?.first
                let rotate = value.first?.second
                if let magnify {
                    scale = magnify.magnification
                    anchor = magnify.startAnchor
                }
                if let rotate {
                    rotation = rotate.rotation
                }
                // Pan with the pinch — but only while a pinch/rotate is engaged,
                // so a plain one-finger swipe still pages the feed.
                if (magnify != nil || rotate != nil), let drag = value.second {
                    offset = drag.translation
                }
            }
            .onEnded { _ in
                withAnimation(.spring(response: 0.35, dampingFraction: 0.72)) {
                    scale = 1
                    rotation = .zero
                    offset = .zero
                }
            }
    }

    @ViewBuilder private var media: some View {
        if item.isVideo, let url = URL(string: item.url) {
            LoopingVideoView(url: url, isActive: isActive)
        } else {
            AsyncImage(url: URL(string: item.url)) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFit()
                case .empty:
                    ProgressView().tint(.white)
                default:
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
    }

    private var overlay: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            HStack(alignment: .bottom) {
                caption
                Spacer(minLength: 12)
                reviewRail
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .background(alignment: .bottom) {
            LinearGradient(
                colors: [.clear, .black.opacity(0.65)],
                startPoint: .center, endPoint: .bottom
            )
            .frame(maxHeight: .infinity, alignment: .bottom)
            .frame(height: 320)
            .allowsHitTesting(false)
        }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label = item.modelLabel, !label.isEmpty {
                Label(label, systemImage: "person.crop.square")
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
            }
            if let prompt = item.prompt, !prompt.isEmpty {
                Text(prompt)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2)
            }
            stars
        }
    }

    /// Interactive 1–5 rating. Tapping the current rating clears it.
    private var stars: some View {
        HStack(spacing: 6) {
            ForEach(1...5, id: \.self) { n in
                Image(systemName: n <= (item.rating ?? 0) ? "star.fill" : "star")
                    .font(.body)
                    .foregroundStyle(
                        n <= (item.rating ?? 0) ? .yellow : .white.opacity(0.7)
                    )
                    .onTapGesture {
                        rate(n == (item.rating ?? 0) ? nil : n)
                    }
            }
        }
    }

    /// The right-hand action stack: favorite, download, share, approval status.
    private var reviewRail: some View {
        VStack(spacing: 20) {
            Button(action: toggleFavorite) {
                railIcon(
                    item.favorite ? "heart.fill" : "heart", "Like",
                    color: item.favorite ? .red : .white, size: 32)
            }
            .buttonStyle(.plain)

            Button(action: download) {
                railIcon(
                    saveIcon, saveLabel, color: saveColor, size: 28,
                    busy: saveState == .saving)
            }
            .buttonStyle(.plain)
            .disabled(saveState == .saving)

            if let url = URL(string: item.url) {
                ShareLink(item: url) {
                    railIcon(
                        "square.and.arrow.up", "Share", color: .white, size: 28)
                }
                .buttonStyle(.plain)
            }

            Menu {
                ForEach(ReviewStatus.allCases) { status in
                    Button {
                        setStatus(
                            item.reviewStatus == status.rawValue ? nil : status)
                    } label: {
                        Label(status.label, systemImage: status.symbol)
                    }
                }
                if item.reviewStatus != nil {
                    Divider()
                    Button("Clear status", role: .destructive) {
                        setStatus(nil)
                    }
                }
            } label: {
                railIcon(statusSymbol, "Review", color: statusColor, size: 28)
            }
        }
    }

    /// One labelled glyph in the rail; shows a spinner while busy.
    private func railIcon(
        _ system: String, _ label: String, color: Color, size: CGFloat,
        busy: Bool = false
    ) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Image(systemName: system)
                    .font(.system(size: size))
                    .foregroundStyle(color)
                    .opacity(busy ? 0 : 1)
                if busy { ProgressView().tint(.white) }
            }
            .frame(height: size)
            Text(label).font(.caption2).foregroundStyle(.white)
        }
    }

    private var saveIcon: String {
        switch saveState {
        case .saved: return "checkmark.circle.fill"
        case .failed: return "exclamationmark.circle"
        default: return "arrow.down.circle"
        }
    }
    private var saveLabel: String {
        switch saveState {
        case .saving: return "Saving"
        case .saved: return "Saved"
        case .failed: return "Retry"
        default: return "Save"
        }
    }
    private var saveColor: Color { saveState == .saved ? .green : .white }

    private var statusSymbol: String {
        item.reviewStatus.flatMap { ReviewStatus(rawValue: $0)?.symbol }
            ?? "checkmark.seal"
    }

    private var statusColor: Color {
        switch item.reviewStatus {
        case "approved": return .green
        case "rejected": return .red
        case "needs_changes": return .orange
        default: return .white
        }
    }

    // MARK: - Writes (optimistic, revert on failure)

    private func toggleFavorite() {
        let previous = item.favorite
        item.favorite.toggle()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        Task {
            do { item.favorite = try await client.toggleFavorite(item.id) }
            catch { item.favorite = previous }
        }
    }

    private func rate(_ rating: Int?) {
        let previous = item.rating
        item.rating = rating
        Task {
            do { try await client.setRating(item.id, rating) }
            catch { item.rating = previous }
        }
    }

    /// Save the full-res image or video to the device's photo library.
    private func download() {
        guard saveState != .saving, let url = URL(string: item.url) else {
            return
        }
        saveState = .saving
        Task {
            do {
                try await PhotoLibrary.save(mediaURL: url, isVideo: item.isVideo)
                saveState = .saved
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } catch {
                saveState = .failed
            }
        }
    }

    private func setStatus(_ status: ReviewStatus?) {
        let previous = item.reviewStatus
        item.reviewStatus = status?.rawValue
        Task {
            do { try await client.setStatus(item.id, status) }
            catch { item.reviewStatus = previous }
        }
    }
}

// MARK: - Looping video

/// An auto-looping, gravity-fill video that plays only while it's the active
/// page (TikTok-style). Backed by an `AVPlayerLayer` so there's no AVKit chrome.
private struct LoopingVideoView: UIViewRepresentable {
    let url: URL
    let isActive: Bool

    func makeUIView(context: Context) -> PlayerView { PlayerView() }

    func updateUIView(_ view: PlayerView, context: Context) {
        view.load(url: url)
        if isActive { view.play() } else { view.pause() }
    }

    static func dismantleUIView(_ view: PlayerView, coordinator: Coordinator) {
        view.pause()
    }

    final class PlayerView: UIView {
        private var looper: AVPlayerLooper?
        private var loadedURL: URL?

        override class var layerClass: AnyClass { AVPlayerLayer.self }
        private var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }

        func load(url: URL) {
            guard loadedURL != url else { return }
            loadedURL = url
            let item = AVPlayerItem(url: url)
            let queue = AVQueuePlayer(playerItem: item)
            queue.isMuted = true
            looper = AVPlayerLooper(player: queue, templateItem: item)
            playerLayer.player = queue
            playerLayer.videoGravity = .resizeAspectFill
        }

        func play() { playerLayer.player?.play() }
        func pause() { playerLayer.player?.pause() }
    }
}
