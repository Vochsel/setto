import SwiftUI

/// Brand marks for the integrations. Shopify and Buffer ship as template SVGs in
/// the asset catalog (tinted to the brand colour); Printify has no published SVG
/// mark, so it renders a brand-green monogram. Mirrors the web BrandBadge.
enum Brand {
    static func color(_ provider: String) -> Color {
        switch provider {
        case "shopify": return Color(red: 0.584, green: 0.749, blue: 0.278)  // #95BF47
        case "printify": return Color(red: 0.122, green: 0.639, blue: 0.388)  // #1FA363
        case "buffer": return Color(red: 0.173, green: 0.294, blue: 1.0)  // #2C4BFF
        default: return .accentColor
        }
    }

    /// Asset-catalog image name for providers with a real SVG mark.
    static func asset(_ provider: String) -> String? {
        switch provider {
        case "shopify": return "BrandShopify"
        case "buffer": return "BrandBuffer"
        default: return nil
        }
    }
}

/// The brand mark on a tinted, rounded tile — legible in light and dark.
struct BrandBadge: View {
    let provider: String
    var size: CGFloat = 40

    var body: some View {
        let color = Brand.color(provider)
        RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
            .fill(color.opacity(0.15))
            .frame(width: size, height: size)
            .overlay {
                if let asset = Brand.asset(provider) {
                    Image(asset)
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(color)
                        .frame(width: size * 0.52, height: size * 0.52)
                } else {
                    Text("P")
                        .font(.system(size: size * 0.5, weight: .bold))
                        .foregroundStyle(color)
                }
            }
    }
}
