import PhotosUI
import SwiftUI
import UIKit

/// Prompt tab of "Add location": name it, describe the scene, generate backdrop
/// candidates asynchronously, then keep the ones you like. The location is
/// created (and attached to the shoot) as soon as you generate, so it behaves
/// like any other location while candidates stream in.
struct PromptLocationForm: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let shootId: String
    let onAdded: () async -> Void

    @State private var name = ""
    @State private var sceneDescription = ""
    @State private var interior = true
    @State private var creating = false
    @State private var error: String?
    @State private var locationId: String?

    var body: some View {
        Group {
            if let locationId {
                VStack(spacing: 0) {
                    ScrollView {
                        BackdropGrid(locationId: locationId).padding()
                    }
                    Divider()
                    HStack {
                        Button("Generate more") {
                            Task { await generateMore(locationId) }
                        }
                        Spacer()
                        Button("Done") {
                            Task { await onAdded() }
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                }
            } else {
                form
            }
        }
    }

    private var form: some View {
        Form {
            Section("Name") {
                TextField("Scandi living room", text: $name)
            }
            Section("Describe the scene") {
                TextField(
                    "a sunlit Scandinavian living room with oak floors, tall windows…",
                    text: $sceneDescription, axis: .vertical
                )
                .lineLimit(3...6)
                Toggle("Interior scene", isOn: $interior)
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                Button {
                    Task { await start() }
                } label: {
                    if creating {
                        HStack { ProgressView(); Text("Generating…") }
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Generate backdrops").frame(maxWidth: .infinity)
                    }
                }
                .disabled(creating)
            } footer: {
                Text("We'll generate 4 candidates — keep the ones you like.")
            }
        }
    }

    private func start() async {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let trimmedDesc = sceneDescription.trimmingCharacters(in: .whitespaces)
        let finalName =
            trimmedName.isEmpty ? String(trimmedDesc.prefix(60)) : trimmedName
        guard !finalName.isEmpty else {
            error = "Give the location a name"
            return
        }
        creating = true
        defer { creating = false }
        do {
            let client = auth.client()
            let id = try await client.createLocation(
                name: finalName,
                promptDescriptor: trimmedDesc.isEmpty ? nil : trimmedDesc)
            try await client.addLocationToShoot(
                shootId: shootId, locationId: id)
            _ = try await client.generateBackdrops(
                locationId: id,
                description: trimmedDesc.isEmpty ? nil : trimmedDesc,
                interior: interior, count: 4)
            await onAdded()  // refresh the shoot so the new location shows up
            locationId = id  // switch to the candidate picker
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func generateMore(_ id: String) async {
        let trimmedDesc = sceneDescription.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await auth.client().generateBackdrops(
                locationId: id,
                description: trimmedDesc.isEmpty ? nil : trimmedDesc,
                interior: interior, count: 4)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Upload tab of "Add location": create a location straight from your own
/// (interior) photos, which ground the backdrop when you generate shots there.
struct UploadLocationForm: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let shootId: String
    let onAdded: () async -> Void

    @State private var name = ""
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var storageIds: [String] = []
    @State private var previews: [UIImage] = []
    @State private var uploading = false
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        !saving && !uploading && !storageIds.isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section("Name") {
                TextField("Studio loft", text: $name)
            }
            Section("Photos") {
                PhotosPicker(
                    selection: $pickerItems, maxSelectionCount: 8,
                    matching: .images
                ) {
                    Label("Add photos", systemImage: "photo.on.rectangle")
                }
                if uploading {
                    HStack { ProgressView(); Text("Uploading…") }
                }
                if !previews.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(previews.enumerated()), id: \.offset) {
                                _, img in
                                Image(uiImage: img).resizable().scaledToFill()
                                    .frame(width: 64, height: 64)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    if saving {
                        HStack { ProgressView(); Text("Saving…") }
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Save location").frame(maxWidth: .infinity)
                    }
                }
                .disabled(!canSave)
            }
        }
        .onChange(of: pickerItems) { _, items in
            Task { await upload(items) }
        }
    }

    private func upload(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploading = true
        defer { uploading = false }
        var ids: [String] = []
        var imgs: [UIImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
                let ui = UIImage(data: data),
                let jpeg = ui.jpegData(compressionQuality: 0.9),
                let id = try? await auth.client().uploadImage(jpeg)
            {
                ids.append(id)
                imgs.append(ui)
            }
        }
        storageIds = ids
        previews = imgs
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            let client = auth.client()
            let id = try await client.createLocation(
                name: name.trimmingCharacters(in: .whitespaces),
                imageStorageIds: storageIds)
            try await client.addLocationToShoot(
                shootId: shootId, locationId: id)
            await onAdded()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A live grid of a location's backdrop candidates. Polls while any are still
/// generating; tap a finished one to keep/unkeep it as a reference image.
struct BackdropGrid: View {
    @EnvironmentObject var auth: AuthStore
    let locationId: String

    @State private var backdrops: [BackdropDoc] = []

    private let columns = [GridItem(.adaptive(minimum: 120), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if backdrops.isEmpty {
                HStack {
                    ProgressView()
                    Text("Generating…").foregroundStyle(.secondary)
                }
            } else {
                Text("Tap a candidate to keep it as a reference.")
                    .font(.caption).foregroundStyle(.secondary)
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(backdrops) { b in tile(b) }
                }
            }
        }
        .task { await pollLoop() }
    }

    private func tile(_ b: BackdropDoc) -> some View {
        ZStack {
            if b.status == "succeeded", let url = b.thumbURL {
                CachedAsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    default: Color.gray.opacity(0.15)
                    }
                }
            } else if b.status == "failed" {
                VStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle")
                    Text(b.error ?? "Failed")
                        .font(.caption2).multilineTextAlignment(.center)
                }
                .foregroundStyle(.secondary).padding(4)
            } else {
                VStack(spacing: 6) {
                    ProgressView()
                    Text(b.progressLabel ?? "Queued…")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(
                    b.isKept ? Color.accentColor : Color.gray.opacity(0.25),
                    lineWidth: b.isKept ? 3 : 1)
        )
        .overlay(alignment: .topLeading) {
            if b.isKept {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.white, Color.accentColor)
                    .padding(6)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if b.status == "succeeded" { toggleKeep(b) }
        }
    }

    private func toggleKeep(_ b: BackdropDoc) {
        Task {
            do {
                if b.isKept {
                    try await auth.client().unkeepBackdrop(id: b.id)
                } else {
                    try await auth.client().keepBackdrop(id: b.id)
                }
                await refresh()
            } catch {
                // A failed keep/unkeep is non-fatal — the next poll re-syncs.
            }
        }
    }

    private func refresh() async {
        if let list = try? await auth.client().locationBackdrops(
            locationId: locationId)
        {
            backdrops = list
        }
    }

    /// Poll every few seconds while the picker is on screen so candidates and
    /// their kept state stay fresh (the HTTP client has no live subscription).
    private func pollLoop() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(nanoseconds: 2_500_000_000)
        }
    }
}
