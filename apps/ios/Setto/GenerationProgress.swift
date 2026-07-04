import SwiftUI

/// A raw generation row from `generations:listByShoot` (every status), used to
/// drive live in-progress tiles. Succeeded rows flow into the settled grid via
/// `review:feed`; here we only surface the ones still working or failed.
struct GenerationRow: Identifiable, Decodable {
    let id: String
    let status: String  // "generating" | "succeeded" | "failed"
    let imageUrl: String?
    let progress: Double?
    let progressLabel: String?
    let error: String?
    let shotId: String?

    var isWorking: Bool { status == "generating" }
    var isFailed: Bool { status == "failed" }

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case status, imageUrl, progress, progressLabel, error, shotId
    }
}

/// A horizontal strip of in-flight / failed generations, shown above a shoot's
/// grid so the user sees work happening instead of guessing when to refresh.
struct PendingStrip: View {
    let rows: [GenerationRow]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(rows) { row in
                    PendingTile(row: row)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }
}

private struct PendingTile: View {
    let row: GenerationRow

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(.background.secondary)
            if row.isFailed {
                VStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text("Failed").font(.caption2)
                }
            } else {
                VStack(spacing: 8) {
                    ProgressView()
                    if let p = row.progress, p > 0 {
                        ProgressView(value: min(max(p, 0), 1))
                            .progressViewStyle(.linear)
                            .tint(.accentColor)
                            .frame(width: 64)
                    }
                    Text(row.progressLabel ?? "Generating…")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(6)
            }
        }
        .frame(width: 96, height: 120)
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(.separator, lineWidth: 0.5))
        .help(row.error ?? "")
    }
}
