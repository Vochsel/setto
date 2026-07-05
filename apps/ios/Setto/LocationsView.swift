import SwiftUI

/// Saved-locations list (reached from the More hub). Tapping a location opens
/// its detail screen. Mirrors the web `/locations` route.
struct LocationsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var locations: [LocationDoc] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        Group {
            if loading && locations.isEmpty {
                ProgressView()
            } else if let error {
                ContentUnavailableView(
                    "Couldn't load",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error))
            } else if locations.isEmpty {
                ContentUnavailableView(
                    "No locations yet", systemImage: "mappin.slash")
            } else {
                List(locations) { loc in
                    NavigationLink {
                        LocationDetailView(location: loc).environmentObject(auth)
                    } label: {
                        LocationRow(location: loc)
                    }
                }
            }
        }
        .navigationTitle("Locations")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            locations = try await auth.client().locations()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct LocationRow: View {
    let location: LocationDoc

    var body: some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: location.thumbURL) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    Color.gray.opacity(0.15)
                        .overlay(
                            Image(systemName: "mappin.and.ellipse")
                                .foregroundStyle(.secondary))
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(location.name).font(.headline)
                if let address = location.address, !address.isEmpty {
                    Text(address).font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

/// A location's detail screen: its reference photos, the "expand search radius +
/// rescan" Street View control (shared engine with the shoot flow), and a
/// quick-capture entry to shoot photos tagged to this location with no shoot.
struct LocationDetailView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var loc: LocationDoc
    @State private var radiusEnabled: Bool
    @State private var radiusMeters: Double
    @State private var capturing = false
    @State private var showQuick = false
    @State private var status: String?
    @State private var error: String?

    init(location: LocationDoc) {
        _loc = State(initialValue: location)
        _radiusEnabled = State(initialValue: location.streetViewRadiusEnabled ?? false)
        _radiusMeters = State(initialValue: location.streetViewRadiusMeters ?? 150)
    }

    private var refs: [ImageRef] {
        (loc.streetViewUrls ?? []) + (loc.imageUrls ?? [])
    }

    var body: some View {
        Form {
            Section("References (\(refs.count))") {
                if refs.isEmpty {
                    Text("No reference photos yet.")
                        .foregroundStyle(.secondary).font(.footnote)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(refs.enumerated()), id: \.offset) { _, ref in
                                CachedAsyncImage(url: URL(string: ref.url)) { phase in
                                    if let image = phase.image {
                                        image.resizable().scaledToFill()
                                    } else {
                                        Color.gray.opacity(0.15)
                                    }
                                }
                                .frame(width: 120, height: 84)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                }
            }

            if loc.hasCoords {
                Section {
                    Toggle("Expand search radius", isOn: $radiusEnabled)
                    if radiusEnabled {
                        HStack {
                            Slider(value: $radiusMeters, in: 50...500, step: 25)
                            Text("\(Int(radiusMeters)) m")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                                .frame(width: 56, alignment: .trailing)
                        }
                    }
                    Button(action: rescan) {
                        if capturing {
                            HStack { ProgressView(); Text("Rescanning…") }
                        } else {
                            Label(
                                radiusEnabled
                                    ? "Rescan + nearby (\(Int(radiusMeters)) m)"
                                    : "Rescan Street View",
                                systemImage: "location.magnifyingglass")
                        }
                    }
                    .disabled(capturing)
                } header: {
                    Text("Street View")
                } footer: {
                    if let status {
                        Text(status).foregroundStyle(.green)
                    } else {
                        Text(
                            "Pull fresh Street View frames. Expanding the radius also samples random nearby spots so the backdrop pool spans the surroundings."
                        )
                    }
                }
            }

            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                Button {
                    showQuick = true
                } label: {
                    Label("Quick capture", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
            } footer: {
                Text("Generate photos tagged to this location — no shoot needed.")
            }
        }
        .navigationTitle(loc.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showQuick) {
            QuickCaptureView(
                anchor: .location(id: loc.id, name: loc.name),
                onStarted: { Task { await refresh() } }
            )
            .environmentObject(auth)
        }
    }

    private func rescan() {
        capturing = true
        error = nil
        status = nil
        Task {
            defer { capturing = false }
            do {
                let c = auth.client()
                try await c.updateLocationRadius(
                    locationId: loc.id, enabled: radiusEnabled,
                    meters: radiusMeters)
                let ack = try await c.captureStreetView(
                    locationId: loc.id,
                    radiusMeters: radiusEnabled ? radiusMeters : 0)
                await refresh()
                let n = ack.added ?? 0
                status =
                    n > 0
                    ? "Captured \(n) Street View frame\(n == 1 ? "" : "s")"
                    : "No new frames found"
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// Reload this location so freshly-captured references show up.
    private func refresh() async {
        if let updated = try? await auth.client().locations()
            .first(where: { $0.id == loc.id })
        {
            loc = updated
        }
    }
}
