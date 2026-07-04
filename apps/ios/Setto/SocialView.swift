import SwiftUI

/// The Social hub: a month calendar of scheduled posts (in the workspace
/// timezone) plus an agenda for the selected day and a drafts shelf. Compose a
/// post from gallery media and schedule it to Buffer.
struct SocialView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var posts: [SocialPost] = []
    @State private var channels: [SocialChannel] = []
    @State private var connections: [Connection] = []
    @State private var tz = Scheduling.defaultTZ
    @State private var loading = false
    @State private var error: String?

    @State private var monthCursor = Date()
    @State private var selectedDay = Date()

    // Composer presentation.
    @State private var editingPost: SocialPost?
    @State private var composingNew = false
    @State private var newDate: Date?

    private var buffer: Connection? {
        connections.first { $0.provider == "buffer" }
    }
    private var cal: Calendar { Scheduling.calendar(tz) }

    private var drafts: [SocialPost] {
        posts.filter { $0.scheduledAt == nil && $0.status != "sent" }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if !connections.isEmpty && buffer == nil { bufferBanner }
                CalendarCard(
                    monthCursor: $monthCursor, selectedDay: $selectedDay,
                    cal: cal, posts: posts)
                agenda
                draftsShelf
            }
            .padding()
        }
        .navigationTitle("Social")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    newDate = nil
                    composingNew = true
                } label: { Image(systemName: "square.and.pencil") }
            }
        }
        .overlay {
            if loading && posts.isEmpty { ProgressView() }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editingPost) { post in
            composer(post: post)
        }
        .sheet(isPresented: $composingNew) {
            composer(post: nil, initial: newDate)
        }
        .alert(
            "Something went wrong", isPresented: .constant(error != nil),
            actions: { Button("OK") { error = nil } },
            message: { Text(error ?? "") })
    }

    // MARK: Pieces

    private var bufferBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "paperplane")
            Text("Connect Buffer to publish to Instagram and more.")
                .font(.caption)
            Spacer()
        }
        .padding(12)
        .background(.background.secondary, in: .rect(cornerRadius: 12))
    }

    private var dayPosts: [SocialPost] {
        posts
            .filter { p in
                guard let d = p.scheduledDate else { return false }
                return cal.isDate(d, inSameDayAs: selectedDay)
            }
            .sorted { ($0.scheduledAt ?? 0) < ($1.scheduledAt ?? 0) }
    }

    private var agenda: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionHeader(selectedDayLabel)
                Spacer()
                Button {
                    newDate = nineAM(on: selectedDay)
                    composingNew = true
                } label: { Label("Add", systemImage: "plus") }
                    .font(.subheadline)
            }
            if dayPosts.isEmpty {
                Text("No posts scheduled.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(dayPosts) { post in
                    PostRow(post: post, tz: tz) { editingPost = post }
                }
            }
        }
    }

    @ViewBuilder private var draftsShelf: some View {
        if !drafts.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Drafts")
                ForEach(drafts) { post in
                    PostRow(post: post, tz: tz) { editingPost = post }
                }
            }
        }
    }

    private func composer(post: SocialPost?, initial: Date? = nil)
        -> some View
    {
        SocialComposerView(
            post: post, timezone: tz, channels: channels,
            initialScheduledAt: initial
        ) { await load() }
        .environmentObject(auth)
    }

    private var selectedDayLabel: String {
        let f = DateFormatter()
        f.timeZone = Scheduling.timeZone(tz)
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: selectedDay)
    }

    private func nineAM(on day: Date) -> Date {
        var comps = cal.dateComponents([.year, .month, .day], from: day)
        comps.hour = 9
        comps.minute = 0
        return cal.date(from: comps) ?? day
    }

    // MARK: Data

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            async let p = client.socialPosts()
            async let c = client.connections()
            async let s = client.workspaceSettings()
            posts = try await p
            connections = try await c
            tz = (try await s).timezone ?? Scheduling.defaultTZ
            error = nil
            // Buffer channels are only meaningful once connected.
            if buffer?.status == "connected", channels.isEmpty {
                channels = (try? await client.socialChannels()) ?? []
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Calendar grid

private struct CalendarCard: View {
    @Binding var monthCursor: Date
    @Binding var selectedDay: Date
    let cal: Calendar
    let posts: [SocialPost]

    private let weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    private var monthLabel: String {
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = cal.timeZone
        f.dateFormat = "MMMM yyyy"
        return f.string(from: monthCursor)
    }

    /// 42 day-cells (6 weeks, Monday-first) covering the cursor's month.
    private var gridDays: [Date] {
        let comps = cal.dateComponents([.year, .month], from: monthCursor)
        guard let first = cal.date(from: comps) else { return [] }
        let weekday = cal.component(.weekday, from: first)  // 1=Sun … 7=Sat
        let offset = (weekday + 5) % 7  // Monday=0
        guard let start = cal.date(byAdding: .day, value: -offset, to: first)
        else { return [] }
        return (0..<42).compactMap {
            cal.date(byAdding: .day, value: $0, to: start)
        }
    }

    private func count(on day: Date) -> Int {
        posts.filter { p in
            guard let d = p.scheduledDate else { return false }
            return cal.isDate(d, inSameDayAs: day)
        }.count
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(monthLabel).font(.headline)
                Spacer()
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                Button("Today") { monthCursor = Date(); selectedDay = Date() }
                    .font(.subheadline)
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
            }
            HStack {
                ForEach(weekdays, id: \.self) { d in
                    Text(d).font(.caption2).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
            LazyVGrid(columns: cols, spacing: 4) {
                ForEach(gridDays, id: \.self) { day in
                    dayCell(day)
                }
            }
        }
        .padding(12)
        .background(.background.secondary, in: .rect(cornerRadius: 14))
    }

    private func dayCell(_ day: Date) -> some View {
        let inMonth = cal.isDate(day, equalTo: monthCursor, toGranularity: .month)
        let isSelected = cal.isDate(day, inSameDayAs: selectedDay)
        let isToday = cal.isDateInToday(day)
        let n = count(on: day)
        return Button {
            selectedDay = day
        } label: {
            VStack(spacing: 3) {
                Text("\(cal.component(.day, from: day))")
                    .font(.callout)
                    .fontWeight(isToday ? .bold : .regular)
                Circle()
                    .fill(n > 0 ? Color.accentColor : .clear)
                    .frame(width: 5, height: 5)
            }
            .frame(maxWidth: .infinity, minHeight: 38)
            .foregroundStyle(inMonth ? .primary : .tertiary)
            .background(
                isSelected ? Color.accentColor.opacity(0.18) : .clear,
                in: .rect(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isToday ? Color.accentColor : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func shift(_ months: Int) {
        if let d = cal.date(byAdding: .month, value: months, to: monthCursor) {
            monthCursor = d
        }
    }
}

// MARK: - Post row

private struct PostRow: View {
    let post: SocialPost
    let tz: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                if let m = post.media.first {
                    CachedAsyncImage(url: m.thumbURL) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color.gray.opacity(0.15)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(.rect(cornerRadius: 8))
                } else {
                    Image(systemName: "text.bubble")
                        .frame(width: 44, height: 44)
                        .background(.background.secondary, in: .rect(cornerRadius: 8))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(post.text.isEmpty ? "Untitled post" : post.text)
                        .font(.subheadline).lineLimit(1)
                    HStack(spacing: 6) {
                        if let d = post.scheduledDate {
                            Text(Scheduling.timeString(d, tz: tz))
                        }
                        Text("· \(post.media.count) media")
                        statusTag
                    }
                    .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            .padding(10)
            .background(.background.secondary, in: .rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var statusTag: some View {
        switch post.status {
        case "sent":
            Text("· sent").foregroundStyle(.green)
        case "error":
            Text("· failed").foregroundStyle(.orange)
        default: EmptyView()
        }
    }
}
