import SwiftUI
import UIKit

/// Full-screen destructive crop for a generation image. Downloads the image,
/// lets the user drag / resize a crop rectangle, then crops on-device and
/// overwrites the original via `generations:replaceImage`.
struct CropView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let generationId: String
    let imageURL: URL
    /// Called with the new image URL after a successful crop.
    var onCropped: (String) -> Void

    @State private var image: UIImage?
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?

    // Crop rect as fractions [0,1] of the displayed (whole) image.
    @State private var rect = CGRect(x: 0.08, y: 0.08, width: 0.84, height: 0.84)
    @State private var dragMode: CropHandle?
    @State private var dragStart = CGRect.zero

    private let minSize: CGFloat = 0.06
    private let handleHit: CGFloat = 44

    enum CropHandle { case move, nw, ne, sw, se }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if loading {
                    ProgressView().tint(.white)
                } else if let image {
                    editor(image)
                } else {
                    ContentUnavailableView(
                        "Couldn't load image", systemImage: "photo",
                        description: error.map(Text.init))
                }
            }
            .navigationTitle("Crop")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.tint(.white)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: apply) {
                        if saving { ProgressView() } else { Text("Crop") }
                    }
                    .disabled(saving || image == nil)
                    .tint(.white)
                }
            }
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task { await loadImage() }
    }

    private func editor(_ image: UIImage) -> some View {
        GeometryReader { geo in
            let frame = fittedFrame(image.size, in: geo.size)
            let pr = pixelRect(rect, in: frame)
            ZStack(alignment: .topLeading) {
                Image(uiImage: image)
                    .resizable()
                    .frame(width: frame.width, height: frame.height)
                    .position(x: frame.midX, y: frame.midY)

                // Dim outside the crop box.
                dim(CGRect(x: 0, y: 0, width: geo.size.width, height: pr.minY))
                dim(CGRect(x: 0, y: pr.maxY, width: geo.size.width, height: geo.size.height - pr.maxY))
                dim(CGRect(x: 0, y: pr.minY, width: pr.minX, height: pr.height))
                dim(CGRect(x: pr.maxX, y: pr.minY, width: geo.size.width - pr.maxX, height: pr.height))

                // Border + thirds + handles.
                Rectangle()
                    .strokeBorder(.white, lineWidth: 1)
                    .frame(width: pr.width, height: pr.height)
                    .position(x: pr.midX, y: pr.midY)
                thirds(pr)
                ForEach(corners(pr), id: \.0) { _, point in
                    Circle().fill(.white)
                        .frame(width: 14, height: 14)
                        .shadow(radius: 1)
                        .position(point)
                }

                // Transparent gesture layer on top.
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { v in onDrag(v, frame: frame) }
                            .onEnded { _ in dragMode = nil }
                    )
            }
        }
    }

    private func dim(_ r: CGRect) -> some View {
        Color.black.opacity(0.55)
            .frame(width: max(0, r.width), height: max(0, r.height))
            .position(x: r.midX, y: r.midY)
    }

    private func thirds(_ pr: CGRect) -> some View {
        ZStack {
            ForEach(1...2, id: \.self) { i in
                let f = CGFloat(i) / 3
                Rectangle().fill(.white.opacity(0.3)).frame(width: 0.5, height: pr.height)
                    .position(x: pr.minX + pr.width * f, y: pr.midY)
                Rectangle().fill(.white.opacity(0.3)).frame(width: pr.width, height: 0.5)
                    .position(x: pr.midX, y: pr.minY + pr.height * f)
            }
        }
    }

    // MARK: Geometry

    private func fittedFrame(_ imageSize: CGSize, in size: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGRect(origin: .zero, size: size)
        }
        let ia = imageSize.width / imageSize.height
        let ba = size.width / size.height
        var w = size.width
        var h = size.height
        if ia > ba { h = size.width / ia } else { w = size.height * ia }
        return CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h)
    }

    private func pixelRect(_ frac: CGRect, in frame: CGRect) -> CGRect {
        CGRect(
            x: frame.minX + frac.minX * frame.width,
            y: frame.minY + frac.minY * frame.height,
            width: frac.width * frame.width,
            height: frac.height * frame.height)
    }

    private func corners(_ pr: CGRect) -> [(String, CGPoint)] {
        [
            ("nw", CGPoint(x: pr.minX, y: pr.minY)),
            ("ne", CGPoint(x: pr.maxX, y: pr.minY)),
            ("sw", CGPoint(x: pr.minX, y: pr.maxY)),
            ("se", CGPoint(x: pr.maxX, y: pr.maxY)),
        ]
    }

    private func onDrag(_ v: DragGesture.Value, frame: CGRect) {
        if dragMode == nil {
            dragStart = rect
            dragMode = detectHandle(v.startLocation, frame: frame)
        }
        let nx = clamp01((v.location.x - frame.minX) / frame.width)
        let ny = clamp01((v.location.y - frame.minY) / frame.height)
        switch dragMode ?? .move {
        case .move:
            let dnx = (v.location.x - v.startLocation.x) / frame.width
            let dny = (v.location.y - v.startLocation.y) / frame.height
            let x = min(max(0, dragStart.minX + dnx), 1 - dragStart.width)
            let y = min(max(0, dragStart.minY + dny), 1 - dragStart.height)
            rect = CGRect(x: x, y: y, width: dragStart.width, height: dragStart.height)
        case .nw, .ne, .sw, .se:
            var left = dragStart.minX
            var top = dragStart.minY
            var right = dragStart.maxX
            var bottom = dragStart.maxY
            let h = dragMode!
            if h == .nw || h == .sw { left = min(nx, right - minSize) }
            if h == .ne || h == .se { right = max(nx, left + minSize) }
            if h == .nw || h == .ne { top = min(ny, bottom - minSize) }
            if h == .sw || h == .se { bottom = max(ny, top + minSize) }
            rect = CGRect(x: left, y: top, width: right - left, height: bottom - top)
        }
    }

    private func detectHandle(_ p: CGPoint, frame: CGRect) -> CropHandle {
        let pr = pixelRect(rect, in: frame)
        let map: [(CropHandle, CGPoint)] = [
            (.nw, CGPoint(x: pr.minX, y: pr.minY)),
            (.ne, CGPoint(x: pr.maxX, y: pr.minY)),
            (.sw, CGPoint(x: pr.minX, y: pr.maxY)),
            (.se, CGPoint(x: pr.maxX, y: pr.maxY)),
        ]
        for (handle, point) in map {
            if hypot(p.x - point.x, p.y - point.y) < handleHit { return handle }
        }
        return .move
    }

    private func clamp01(_ n: CGFloat) -> CGFloat { min(1, max(0, n)) }

    // MARK: Data

    private func loadImage() async {
        do {
            let (data, _) = try await URLSession.shared.data(from: imageURL)
            image = UIImage(data: data)
            if image == nil { error = "Unsupported image" }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func apply() {
        guard let image else { return }
        saving = true
        error = nil
        Task {
            defer { saving = false }
            do {
                let normalized = image.normalizedUp()
                guard let cg = normalized.cgImage else {
                    throw NSError(
                        domain: "crop", code: 0,
                        userInfo: [NSLocalizedDescriptionKey: "Bad image"])
                }
                let pw = CGFloat(cg.width)
                let ph = CGFloat(cg.height)
                let cropRect = CGRect(
                    x: rect.minX * pw, y: rect.minY * ph,
                    width: rect.width * pw, height: rect.height * ph
                ).integral
                guard let cropped = cg.cropping(to: cropRect),
                    let data = UIImage(cgImage: cropped).jpegData(compressionQuality: 0.95)
                else {
                    throw NSError(
                        domain: "crop", code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "Crop failed"])
                }
                let c = ConvexClient(
                    baseURL: Config.convexURL, token: auth.validToken())
                let storageId = try await c.uploadImage(data)
                let newUrl = try await c.replaceGenerationImage(
                    generationId: generationId, storageId: storageId)
                onCropped(newUrl ?? "")
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

extension UIImage {
    /// Redraw with `.up` orientation so cropping in pixel space is correct.
    func normalizedUp() -> UIImage {
        if imageOrientation == .up { return self }
        return UIGraphicsImageRenderer(size: size).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
