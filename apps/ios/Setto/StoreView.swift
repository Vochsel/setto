import SwiftUI

/// The Store hub: a holistic view of the product-photography economics —
/// catalog, production cost vs. retail, orders and shipping — pulled from
/// Printify (and synced from Shopify). One "Sync" pulls both.
struct StoreView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var connections: [Connection] = []
    @State private var summary: StoreSummary?
    @State private var products: [StoreProduct] = []
    @State private var orders: [StoreOrder] = []
    @State private var loading = false
    @State private var syncing = false
    @State private var error: String?

    private var printify: Connection? {
        connections.first { $0.provider == "printify" }
    }
    private var shopify: Connection? {
        connections.first { $0.provider == "shopify" }
    }
    private var currency: String? { summary?.currency }

    var body: some View {
        Group {
            if connections.isEmpty && !loading {
                connectPrompt
            } else {
                ScrollView {
                    VStack(spacing: 20) {
                        summaryGrid
                        productsSection
                        ordersSection
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Store")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await sync() }
                } label: {
                    if syncing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(syncing || (printify == nil && shopify == nil))
            }
        }
        .overlay {
            if loading && summary == nil { ProgressView() }
        }
        .refreshable { await load() }
        .task { await load() }
        .alert(
            "Something went wrong", isPresented: .constant(error != nil),
            actions: { Button("OK") { error = nil } },
            message: { Text(error ?? "") })
    }

    private var connectPrompt: some View {
        ContentUnavailableView {
            Label("Connect your store", systemImage: "bag")
        } description: {
            Text(
                "Link Shopify or Printify in Connections to see products, costs, orders and shipping."
            )
        }
    }

    // MARK: Summary

    private var summaryGrid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12
        ) {
            StatCard(
                label: "Products", value: "\(summary?.productCount ?? 0)",
                icon: "shippingbox")
            StatCard(
                label: "Orders", value: "\(summary?.orderCount ?? 0)",
                sub: (summary?.openOrders ?? 0) > 0
                    ? "\(summary!.openOrders) open" : nil,
                icon: "cart")
            StatCard(
                label: "Revenue", value: money(summary?.revenue, currency: currency),
                icon: "chart.line.uptrend.xyaxis")
            StatCard(
                label: "Margin", value: money(summary?.margin, currency: currency),
                sub: "cost \(money(summary?.productionCost, currency: currency))",
                icon: "chart.pie")
        }
    }

    // MARK: Products

    @ViewBuilder private var productsSection: some View {
        if !products.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Products", subtitle: "Production cost vs. retail")
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 150), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(products) { p in ProductCard(product: p) }
                }
            }
        }
    }

    // MARK: Orders

    @ViewBuilder private var ordersSection: some View {
        if !orders.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Recent orders", subtitle: "Status & shipping")
                VStack(spacing: 0) {
                    ForEach(orders) { o in
                        OrderRow(order: o, fallbackCurrency: currency)
                        if o.id != orders.last?.id { Divider() }
                    }
                }
                .padding(.vertical, 4)
                .background(.background.secondary, in: .rect(cornerRadius: 12))
            }
        }
    }

    // MARK: Data

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let client = auth.client()
            async let c = client.connections()
            async let s = client.storeSummary()
            async let p = client.storeProducts()
            async let o = client.storeOrders(limit: 25)
            connections = try await c
            summary = try await s
            products = try await p
            orders = try await o
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func sync() async {
        syncing = true
        defer { syncing = false }
        let client = auth.client()
        do {
            // Run whichever are connected; surface the first failure.
            if shopify != nil { try await client.syncShopify() }
            if printify != nil { try await client.syncPrintify() }
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Pieces

private struct StatCard: View {
    let label: String
    let value: String
    var sub: String? = nil
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value).font(.title2.weight(.semibold)).monospacedDigit()
            if let sub {
                Text(sub).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.background.secondary, in: .rect(cornerRadius: 12))
    }
}

private struct ProductCard: View {
    let product: StoreProduct

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CachedAsyncImage(url: product.thumbURL) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color.gray.opacity(0.15)
                }
            }
            .frame(height: 120)
            .frame(maxWidth: .infinity)
            .clipped()
            VStack(alignment: .leading, spacing: 4) {
                Text(product.title).font(.caption.weight(.medium)).lineLimit(1)
                HStack {
                    Text("cost \(money(product.cost, currency: product.currency))")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(money(product.price, currency: product.currency))
                        .fontWeight(.medium)
                }
                .font(.caption2)
                if let margin = product.margin {
                    Text("+\(money(margin, currency: product.currency)) margin")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
            .padding(8)
        }
        .background(.background.secondary, in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(.separator, lineWidth: 0.5))
    }
}

private struct OrderRow: View {
    let order: StoreOrder
    let fallbackCurrency: String?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("#\(order.orderId)")
                        .font(.caption.monospaced())
                    if let status = order.status {
                        Text(status)
                            .font(.caption2)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(.quaternary, in: .capsule)
                    }
                }
                Text(order.destination ?? "—")
                    .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(money(order.totalPrice, currency: order.currency ?? fallbackCurrency))
                    .font(.caption.weight(.medium)).monospacedDigit()
                Text("cost \(money(order.productionCost, currency: order.currency ?? fallbackCurrency))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if let urlStr = order.shipment?.url, let url = URL(string: urlStr) {
                Link(destination: url) {
                    Image(systemName: "shippingbox").foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }
}

/// A small left-aligned section header used across the Store/Social hubs.
struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.headline)
            if let subtitle {
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
