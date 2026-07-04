import SwiftUI

/// Connect Shopify / Printify / Buffer by pasting a per-user API key. Secrets are
/// encrypted server-side (`integrationsNode:connect`); this screen only ever
/// shows the connection status and a human label.
struct ConnectionsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var connections: [Connection] = []
    @State private var loading = false
    @State private var error: String?
    @State private var connecting: IntegrationProvider?

    private func connection(_ p: IntegrationProvider) -> Connection? {
        connections.first { $0.provider == p.rawValue }
    }

    var body: some View {
        List {
            Section {
                ForEach(IntegrationProvider.allCases) { provider in
                    ProviderRow(
                        provider: provider,
                        connection: connection(provider),
                        onConnect: { connecting = provider },
                        onTest: { await test(provider) },
                        onDisconnect: { await disconnect(provider) })
                }
            } footer: {
                Text(
                    "Your keys are encrypted and only used to sync your store and schedule posts."
                )
            }
        }
        .navigationTitle("Connections")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if loading && connections.isEmpty { ProgressView() }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $connecting) { provider in
            ConnectSheet(provider: provider) { await load() }
                .environmentObject(auth)
        }
        .alert(
            "Something went wrong", isPresented: .constant(error != nil),
            actions: { Button("OK") { error = nil } },
            message: { Text(error ?? "") })
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            connections = try await auth.client().connections()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func test(_ p: IntegrationProvider) async {
        do {
            let res = try await auth.client().testConnection(p.rawValue)
            if !res.ok { error = res.error ?? "Verification failed" }
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func disconnect(_ p: IntegrationProvider) async {
        do {
            try await auth.client().disconnect(p.rawValue)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One provider row: icon, title, live status, and a context menu of actions.
private struct ProviderRow: View {
    let provider: IntegrationProvider
    let connection: Connection?
    let onConnect: () -> Void
    let onTest: () async -> Void
    let onDisconnect: () async -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: provider.symbol)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(provider.title).font(.body.weight(.medium))
                Text(connection?.label ?? provider.blurb)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            statusBadge
        }
        .contentShape(Rectangle())
        .onTapGesture { if connection == nil { onConnect() } }
        .swipeActions(edge: .trailing) {
            if connection != nil {
                Button(role: .destructive) {
                    Task { await onDisconnect() }
                } label: { Label("Disconnect", systemImage: "trash") }
                Button { Task { await onTest() } } label: {
                    Label("Test", systemImage: "arrow.clockwise")
                }
                .tint(.blue)
            }
        }
        .contextMenu {
            if connection == nil {
                Button("Connect", action: onConnect)
            } else {
                Button("Reconnect", action: onConnect)
                Button("Test") { Task { await onTest() } }
                Button("Disconnect", role: .destructive) {
                    Task { await onDisconnect() }
                }
            }
        }
    }

    @ViewBuilder private var statusBadge: some View {
        switch connection?.status {
        case "connected":
            Label("Connected", systemImage: "checkmark.circle.fill")
                .labelStyle(.iconOnly)
                .foregroundStyle(.green)
        case "error":
            Label("Error", systemImage: "exclamationmark.triangle.fill")
                .labelStyle(.iconOnly)
                .foregroundStyle(.orange)
        case "unverified":
            Image(systemName: "clock.fill").foregroundStyle(.secondary)
        default:
            Text("Connect").font(.caption.weight(.medium))
                .foregroundStyle(.tint)
        }
    }
}

/// Sheet to paste a provider's secret (+ Shopify store domain) and connect.
private struct ConnectSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let provider: IntegrationProvider
    let onDone: () async -> Void

    @State private var secret = ""
    @State private var domain = ""
    @State private var busy = false
    @State private var error: String?

    private var canConnect: Bool {
        !secret.trimmingCharacters(in: .whitespaces).isEmpty
            && (!provider.needsDomain
                || !domain.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                if provider.needsDomain {
                    Section("Store domain") {
                        TextField("your-store.myshopify.com", text: $domain)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                    }
                }
                Section(provider.secretLabel) {
                    SecureField("Paste your key", text: $secret)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                if let error {
                    Section {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Connect \(provider.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Connect") { Task { await connect() } }
                        .disabled(!canConnect || busy)
                }
            }
            .overlay {
                if busy {
                    Color.black.opacity(0.05).ignoresSafeArea()
                    ProgressView("Verifying…")
                }
            }
        }
    }

    private func connect() async {
        busy = true
        defer { busy = false }
        var meta: [String: Any] = [:]
        if provider.needsDomain {
            meta["domain"] = domain.trimmingCharacters(in: .whitespaces)
        }
        do {
            let res = try await auth.client().connect(
                provider: provider.rawValue,
                secret: secret.trimmingCharacters(in: .whitespaces), meta: meta)
            if res.ok {
                await onDone()
                dismiss()
            } else {
                error = res.error ?? "Couldn't verify that key."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
