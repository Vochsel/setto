import SwiftUI
import UIKit

/// A transparent probe that attaches pinch + rotation recognizers to the
/// *enclosing* UIScrollView, so the "peek" transform (zoom / rotate / pan)
/// works WITHOUT a SwiftUI `DragGesture` stealing the vertical paging swipe —
/// the bug that broke the TikTok scroll. Pan is derived from the pinch centroid
/// (no separate pan recognizer), and scrolling is frozen only while a pinch is
/// active. Reports live values up to SwiftUI.
struct PeekGestureAttacher: UIViewRepresentable {
    /// scale, rotation (radians), translation, anchor (unit point 0…1).
    var onChange: (CGFloat, CGFloat, CGSize, CGPoint) -> Void
    var onEnded: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onChange: onChange, onEnded: onEnded)
    }

    func makeUIView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.isUserInteractionEnabled = false  // never intercept touches itself
        view.onReady = { [weak coordinator = context.coordinator] scroll in
            coordinator?.attach(to: scroll)
        }
        return view
    }

    func updateUIView(_ uiView: ProbeView, context: Context) {
        context.coordinator.onChange = onChange
        context.coordinator.onEnded = onEnded
    }

    /// Finds the nearest ancestor UIScrollView once it's in the window.
    final class ProbeView: UIView {
        var onReady: ((UIScrollView) -> Void)?
        private var done = false

        override func didMoveToWindow() {
            super.didMoveToWindow()
            tryAttach()
        }
        override func layoutSubviews() {
            super.layoutSubviews()
            tryAttach()
        }
        private func tryAttach() {
            guard !done, window != nil else { return }
            var v: UIView? = superview
            while let cur = v {
                if let scroll = cur as? UIScrollView {
                    done = true
                    onReady?(scroll)
                    return
                }
                v = cur.superview
            }
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onChange: (CGFloat, CGFloat, CGSize, CGPoint) -> Void
        var onEnded: () -> Void

        private weak var scroll: UIScrollView?
        private var pinch: UIPinchGestureRecognizer?
        private var rotate: UIRotationGestureRecognizer?
        private var startCentroid: CGPoint = .zero
        private var anchor: CGPoint = CGPoint(x: 0.5, y: 0.5)
        private var active = false

        init(
            onChange: @escaping (CGFloat, CGFloat, CGSize, CGPoint) -> Void,
            onEnded: @escaping () -> Void
        ) {
            self.onChange = onChange
            self.onEnded = onEnded
        }

        func attach(to scroll: UIScrollView) {
            guard pinch == nil else { return }
            self.scroll = scroll
            let p = UIPinchGestureRecognizer(
                target: self, action: #selector(handle(_:)))
            let r = UIRotationGestureRecognizer(
                target: self, action: #selector(handle(_:)))
            p.delegate = self
            r.delegate = self
            scroll.addGestureRecognizer(p)
            scroll.addGestureRecognizer(r)
            pinch = p
            rotate = r
        }

        @objc private func handle(_ g: UIGestureRecognizer) {
            guard let scroll, let pinch, let rotate else { return }

            switch g.state {
            case .began:
                if !active {
                    active = true
                    scroll.isScrollEnabled = false  // freeze paging during peek
                    let c =
                        pinch.numberOfTouches >= 2
                        ? pinch.location(in: scroll) : g.location(in: scroll)
                    startCentroid = c
                    let w = max(1, scroll.bounds.width)
                    let h = max(1, scroll.bounds.height)
                    anchor = CGPoint(
                        x: c.x / w,
                        y: (c.y - scroll.contentOffset.y) / h)
                }
            case .changed:
                guard active else { return }
                let c =
                    pinch.numberOfTouches >= 2
                    ? pinch.location(in: scroll) : startCentroid
                let translation = CGSize(
                    width: c.x - startCentroid.x, height: c.y - startCentroid.y)
                onChange(pinch.scale, rotate.rotation, translation, anchor)
            case .ended, .cancelled, .failed:
                // Finish only once both recognizers are done.
                let stillActive = [pinch, rotate].contains {
                    $0.state == .began || $0.state == .changed
                }
                if active && !stillActive {
                    active = false
                    scroll.isScrollEnabled = true
                    pinch.scale = 1
                    rotate.rotation = 0
                    onEnded()
                }
            default:
                break
            }
        }

        // Pinch + rotation recognize together (and alongside the scroll).
        func gestureRecognizer(
            _ g: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
