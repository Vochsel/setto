import SwiftUI

/// Reports a scroll view's content offset up to its enclosing coordinate space.
struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// A vertical ScrollView that flips `headerHidden` from scroll direction — hide
/// on scroll-down, reveal on scroll-up or near the top. Drives the auto-hiding
/// navigation header in the gallery/list views (leaving floating buttons).
struct AutoHidingScroll<Content: View>: View {
    @Binding var headerHidden: Bool
    @ViewBuilder var content: Content
    @State private var lastOffset: CGFloat = 0

    var body: some View {
        ScrollView {
            content
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetKey.self,
                            value: geo.frame(in: .named("ahScroll")).minY)
                    }
                )
        }
        .coordinateSpace(name: "ahScroll")
        .onPreferenceChange(ScrollOffsetKey.self) { offset in
            let delta = offset - lastOffset
            if offset < -40, delta < -4 {
                if !headerHidden {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        headerHidden = true
                    }
                }
            } else if delta > 6 || offset > -8 {
                if headerHidden {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        headerHidden = false
                    }
                }
            }
            lastOffset = offset
        }
    }
}

/// A circular floating action button used over the gallery grids.
struct FloatingButton: View {
    let systemImage: String
    var tint: Color = .accentColor
    var size: CGFloat = 52
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(tint, in: Circle())
                .shadow(radius: 5, y: 2)
        }
    }
}
