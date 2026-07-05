import SwiftUI

/// Compose or edit a social post: media, caption, channels and an optional
/// schedule (in the workspace timezone). Save keeps it on the calendar as a
/// draft; Schedule/Post pushes to Buffer.
struct SocialComposerView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    let post: SocialPost?
    let timezone: String
    let channels: [SocialChannel]
    var initialMedia: [SocialMedia] = []
    var initialScheduledAt: Date?
    let onChange: () async -> Void

    @State private var text = ""
    @State private var media: [SocialMedia] = []
    @State private var channelIds: Set<String> = []
    @State private var scheduleOn = false
    @State private var scheduleDate = Date()
    @State private var pickerOpen = false
    @State private var busy = false
    @State private var error: String?
    @State private var seeded = false

    private var isSent: Bool { post?.isSent ?? false }
    private var scheduledAtMs: Double? {
        scheduleOn ? scheduleDate.timeIntervalSince1970 * 1000 : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                mediaSection
                Section("Caption") {
                    TextField("Write a caption…", text: $text, axis: .vertical)
                        .lineLimit(3...8)
                        .disabled(isSent)
                }
                channelsSection
                scheduleSection
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(.red) }
                }
                if post != nil && !isSent {
                    Section {
                        Button("Delete post", role: .destructive) {
                            Task { await remove() }
                        }
                    }
                }
            }
            .navigationTitle(post == nil ? "New post" : "Edit post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSent {
                        Label("Sent", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                    } else {
                        Menu {
                            Button("Save to calendar") { Task { await save() } }
                            Button(scheduleOn ? "Schedule to Buffer" : "Post now") {
                                Task { await publish() }
                            }
                            .disabled(media.isEmpty)
                        } label: {
                            if busy { ProgressView() } else { Text("Done") }
                        }
                        .disabled(busy)
                    }
                }
            }
            .sheet(isPresented: $pickerOpen) {
                MediaPickerView { picked in
                    let seen = Set(media.map(\.url))
                    media.append(contentsOf: picked.filter { !seen.contains($0.url) })
                }
                .environmentObject(auth)
            }
            .onAppear(perform: seed)
        }
    }

    // MARK: Sections

    private var mediaSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(media) { m in
                        ZStack(alignment: .topTrailing) {
                            CachedAsyncImage(url: m.thumbURL) { phase in
                                switch phase {
                                case .success(let img): img.resizable().scaledToFill()
                                default: Color.gray.opacity(0.15)
                                }
                            }
                            .frame(width: 76, height: 76)
                            .clipShape(.rect(cornerRadius: 10))
                            if !isSent {
                                Button {
                                    media.removeAll { $0.url == m.url }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.white, .black.opacity(0.5))
                                }
                                .padding(2)
                            }
                            if m.isVideo {
                                Image(systemName: "film.fill")
                                    .font(.caption2).foregroundStyle(.white)
                                    .padding(4)
                            }
                        }
                    }
                    if !isSent {
                        Button { pickerOpen = true } label: {
                            VStack(spacing: 4) {
                                Image(systemName: "plus")
                                Text("Add").font(.caption2)
                            }
                            .frame(width: 76, height: 76)
                            .foregroundStyle(.secondary)
                            .background(.background.secondary, in: .rect(cornerRadius: 10))
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder private var channelsSection: some View {
        Section("Channels") {
            if channels.isEmpty {
                Text("Connect Buffer in Connections to pick channels. You can still save to the calendar.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(channels) { channel in
                    Button {
                        toggleChannel(channel.id)
                    } label: {
                        HStack {
                            Image(systemName: "at")
                                .foregroundStyle(.secondary)
                            Text(channel.label)
                            Spacer()
                            if channelIds.contains(channel.id) {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                    .disabled(isSent)
                }
            }
        }
    }

    private var scheduleSection: some View {
        Section {
            Toggle("Schedule for later", isOn: $scheduleOn).disabled(isSent)
            if scheduleOn {
                DatePicker(
                    "When", selection: $scheduleDate,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .environment(\.timeZone, Scheduling.timeZone(timezone))
                .disabled(isSent)
            }
        } footer: {
            Text(
                scheduleOn
                    ? "Times are in \(Scheduling.abbrev(timezone))."
                    : "No schedule keeps it as a draft on your calendar.")
        }
    }

    // MARK: Actions

    private func seed() {
        guard !seeded else { return }
        seeded = true
        if let post {
            text = post.text
            media = post.media
            channelIds = Set(post.channelIds)
            if let date = post.scheduledDate {
                scheduleOn = true
                scheduleDate = date
            }
        } else {
            media = initialMedia
            if channels.count == 1 { channelIds = [channels[0].id] }
            if let initialScheduledAt {
                scheduleOn = true
                scheduleDate = initialScheduledAt
            }
        }
    }

    private func toggleChannel(_ id: String) {
        if channelIds.contains(id) { channelIds.remove(id) } else {
            channelIds.insert(id)
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let client = auth.client()
            if let post {
                try await client.updatePost(
                    id: post.id, text: text, media: media,
                    channelIds: Array(channelIds), scheduledAt: scheduledAtMs)
            } else {
                _ = try await client.saveDraft(
                    text: text, media: media, channelIds: Array(channelIds),
                    scheduledAt: scheduledAtMs)
            }
            await onChange()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func publish() async {
        guard !channelIds.isEmpty else {
            error = "Pick at least one channel."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let client = auth.client()
            let res: ScheduleResult
            if let post {
                try await client.updatePost(
                    id: post.id, text: text, media: media,
                    channelIds: Array(channelIds), scheduledAt: scheduledAtMs)
                res = try await client.publishPost(id: post.id)
            } else {
                res = try await client.schedulePost(
                    text: text, media: media, channelIds: Array(channelIds),
                    scheduledAt: scheduledAtMs)
            }
            if res.ok {
                await onChange()
                dismiss()
            } else {
                error = res.error ?? "Buffer rejected the post."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        guard let post else { return }
        busy = true
        defer { busy = false }
        do {
            try await auth.client().removePost(id: post.id)
            await onChange()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
