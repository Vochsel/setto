import CoreLocation
import MapKit
import SwiftUI

/// Add a location to a shoot without leaving the phone: center on where you are,
/// tap a nearby place or drop a pin, name it, and save. Coordinates trigger a
/// server-side Street View capture so the location comes with reference imagery.
struct AddLocationView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let shootId: String
    let onAdded: () async -> Void

    @StateObject private var locator = LocationManager()

    @State private var camera: MapCameraPosition = .automatic
    @State private var mapCenter: CLLocationCoordinate2D?
    @State private var pois: [POI] = []
    @State private var searching = false
    @State private var selection: PickedLocation?
    @State private var name = ""
    @State private var creating = false
    @State private var error: String?
    @State private var centeredOnce = false
    @State private var saved: [LocationDoc] = []
    @State private var savedOpen = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                map
                if locator.isDenied && selection == nil {
                    deniedNote
                }
                if selection != nil {
                    selectionCard
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Add location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    if !saved.isEmpty {
                        Button("Saved") { savedOpen = true }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        if let c = mapCenter { Task { await searchNearby(c) } }
                    } label: {
                        if searching { ProgressView() } else {
                            Label("Search here", systemImage: "magnifyingglass")
                        }
                    }
                    .disabled(searching)
                }
            }
            .sheet(isPresented: $savedOpen) {
                SavedLocationsSheet(locations: saved) { loc in
                    await addExisting(loc)
                }
            }
            .task { saved = (try? await auth.client().locations()) ?? [] }
            .onAppear { locator.requestLocation() }
            .onReceive(locator.$location) { loc in
                guard let loc, !centeredOnce else { return }
                centeredOnce = true
                let region = MKCoordinateRegion(
                    center: loc.coordinate,
                    span: MKCoordinateSpan(
                        latitudeDelta: 0.01, longitudeDelta: 0.01))
                camera = .region(region)
                mapCenter = loc.coordinate
                Task { await searchNearby(loc.coordinate) }
            }
            .alert(
                "Couldn't add", isPresented: .constant(error != nil),
                actions: { Button("OK") { error = nil } },
                message: { Text(error ?? "") })
        }
    }

    // MARK: Map

    private var map: some View {
        MapReader { proxy in
            Map(position: $camera) {
                UserAnnotation()
                ForEach(pois) { poi in
                    Annotation(poi.name, coordinate: poi.coordinate) {
                        Button { select(poi) } label: {
                            Image(systemName: "mappin.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.red)
                                .background(Circle().fill(.white).padding(3))
                        }
                    }
                }
                if let selection {
                    Annotation(selection.name, coordinate: selection.coordinate) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.title)
                            .foregroundStyle(.tint)
                    }
                }
            }
            .mapControls { MapUserLocationButton() }
            .onMapCameraChange { ctx in mapCenter = ctx.region.center }
            .onTapGesture { point in
                if let coord = proxy.convert(point, from: .local) {
                    Task { await dropPin(coord) }
                }
            }
        }
    }

    private var deniedNote: some View {
        Text("Location access is off — search this area or tap the map to drop a pin.")
            .font(.caption)
            .padding(10)
            .background(.ultraThinMaterial, in: .rect(cornerRadius: 10))
            .padding()
            .frame(maxHeight: .infinity, alignment: .top)
    }

    private var selectionCard: some View {
        VStack(spacing: 12) {
            Capsule().fill(.secondary).frame(width: 36, height: 4)
            VStack(alignment: .leading, spacing: 8) {
                TextField("Location name", text: $name)
                    .font(.headline)
                    .textFieldStyle(.roundedBorder)
                if let address = selection?.address, !address.isEmpty {
                    Label(address, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Button {
                Task { await add() }
            } label: {
                if creating {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Add to shoot").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(creating || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding()
        .padding(.bottom, 20)
        .background(.regularMaterial, in: .rect(topLeadingRadius: 20, topTrailingRadius: 20))
        .shadow(radius: 8, y: -2)
    }

    // MARK: Actions

    private func select(_ poi: POI) {
        selection = PickedLocation(
            name: poi.name, coordinate: poi.coordinate, address: poi.address)
        name = poi.name
        withAnimation {
            camera = .region(
                MKCoordinateRegion(
                    center: poi.coordinate,
                    span: MKCoordinateSpan(
                        latitudeDelta: 0.005, longitudeDelta: 0.005)))
        }
    }

    private func dropPin(_ coord: CLLocationCoordinate2D) async {
        selection = PickedLocation(name: "Dropped pin", coordinate: coord, address: nil)
        let (geoName, address) = await reverseGeocode(coord)
        selection?.address = address
        if let geoName {
            selection?.name = geoName
            if name.isEmpty || name == "Dropped pin" { name = geoName }
        } else if name.isEmpty {
            name = "New location"
        }
    }

    private func searchNearby(_ center: CLLocationCoordinate2D) async {
        searching = true
        defer { searching = false }
        let request = MKLocalPointsOfInterestRequest(center: center, radius: 800)
        do {
            let response = try await MKLocalSearch(request: request).start()
            pois = response.mapItems.prefix(24).map { item in
                POI(
                    name: item.name ?? "Place",
                    coordinate: item.placemark.coordinate,
                    address: item.placemark.title)
            }
        } catch {
            // A failed nearby search is fine — the user can still drop a pin.
        }
    }

    private func reverseGeocode(_ coord: CLLocationCoordinate2D) async -> (
        String?, String?
    ) {
        let geocoder = CLGeocoder()
        let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        guard let pm = try? await geocoder.reverseGeocodeLocation(loc).first else {
            return (nil, nil)
        }
        let address = [pm.subThoroughfare, pm.thoroughfare, pm.locality]
            .compactMap { $0 }.joined(separator: " ")
        return (pm.name, address.isEmpty ? nil : address)
    }

    private func addExisting(_ loc: LocationDoc) async {
        do {
            try await auth.client().addLocationToShoot(
                shootId: shootId, locationId: loc.id)
            await onAdded()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func add() async {
        guard let selection else { return }
        creating = true
        defer { creating = false }
        do {
            let client = auth.client()
            let trimmed = name.trimmingCharacters(in: .whitespaces)
            let locationId = try await client.createLocation(
                name: trimmed, address: selection.address,
                lat: selection.coordinate.latitude,
                lng: selection.coordinate.longitude)
            try await client.addLocationToShoot(
                shootId: shootId, locationId: locationId)
            // Fetch Street View imagery in the background — best effort.
            Task { try? await auth.client().captureStreetView(locationId: locationId) }
            await onAdded()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Pick from the workspace's already-saved locations (e.g. created on web or in
/// another shoot) instead of making a new one.
private struct SavedLocationsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let locations: [LocationDoc]
    let onPick: (LocationDoc) async -> Void

    var body: some View {
        NavigationStack {
            List(locations) { loc in
                Button {
                    Task { await onPick(loc) }
                } label: {
                    HStack(spacing: 12) {
                        CachedAsyncImage(url: loc.thumbURL) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Color.gray.opacity(0.15)
                            }
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(.rect(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(loc.name).font(.body)
                            if let address = loc.address {
                                Text(address).font(.caption)
                                    .foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        Spacer()
                        if loc.hasImagery {
                            Image(systemName: "photo").foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
            .navigationTitle("Saved locations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

/// A nearby point of interest from MapKit search.
struct POI: Identifiable {
    let id = UUID()
    let name: String
    let coordinate: CLLocationCoordinate2D
    let address: String?
}

/// The location the user has chosen (a POI, or a dropped + geocoded pin).
struct PickedLocation {
    var name: String
    var coordinate: CLLocationCoordinate2D
    var address: String?
}
