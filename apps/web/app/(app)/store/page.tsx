"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  RefreshCw,
  Loader2,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Plug,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

function money(minor?: number, currency = "USD") {
  if (minor == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export default function StorePage() {
  const connections = useQuery(api.integrations.list, {});
  const summary = useQuery(api.printify.summary, {});
  const products = useQuery(api.printify.products, {});
  const orders = useQuery(api.printify.orders, { limit: 25 });
  const syncPrintify = useAction(api.printifyNode.sync);
  const syncShopify = useAction(api.shopify.sync);
  const [syncing, setSyncing] = useState(false);

  const printify = connections?.find((c) => c.provider === "printify");
  const shopify = connections?.find((c) => c.provider === "shopify");
  const currency = summary?.currency ?? "USD";

  async function sync() {
    setSyncing(true);
    try {
      const results = await Promise.allSettled([
        shopify ? syncShopify({}) : Promise.resolve(null),
        printify ? syncPrintify({}) : Promise.resolve(null),
      ]);
      const errors = results.filter((r) => r.status === "rejected");
      if (errors.length)
        toast.error(
          (errors[0] as PromiseRejectedResult).reason?.message ??
            "Sync failed",
        );
      else toast.success("Store synced");
    } finally {
      setSyncing(false);
    }
  }

  if (connections && !printify && !shopify) {
    return (
      <>
        <PageHeader title="Store" description="Products, costs, orders & shipping" />
        <div className="p-4 md:p-6">
          <EmptyState
            icon={Plug}
            title="Connect your store"
            description="Link Shopify (product wardrobe) or Printify (production costs, orders & shipping) to see everything here."
            action={
              <Button asChild>
                <Link href="/settings">Go to Connections</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  const stats = [
    {
      label: "Products",
      value: summary?.productCount ?? 0,
      icon: Package,
    },
    {
      label: "Orders",
      value: summary?.orderCount ?? 0,
      sub: summary?.openOrders ? `${summary.openOrders} open` : undefined,
      icon: ShoppingCart,
    },
    {
      label: "Revenue",
      value: money(summary?.revenue, currency),
      icon: TrendingUp,
    },
    {
      label: "Margin",
      value: money(summary?.margin, currency),
      sub: `cost ${money(summary?.productionCost, currency)}`,
      icon: TrendingUp,
    },
  ];

  return (
    <>
      <PageHeader title="Store" description="Products, costs, orders & shipping">
        <Button onClick={sync} disabled={syncing || !connections}>
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync
        </Button>
      </PageHeader>

      <div className="space-y-6 p-4 md:p-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <s.icon className="h-3.5 w-3.5" /> {s.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {s.value}
                </div>
                {s.sub && (
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {s.sub}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
            <CardDescription>
              Production cost vs. retail from Printify.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!products?.length ? (
              <p className="text-muted-foreground text-sm">
                {printify
                  ? "No products yet — hit Sync."
                  : "Connect Printify to see production costs."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => {
                  const margin =
                    p.price != null && p.cost != null
                      ? p.price - p.cost
                      : undefined;
                  return (
                    <div
                      key={p._id}
                      className="overflow-hidden rounded-lg border"
                    >
                      <div className="bg-muted aspect-square">
                        {p.images?.[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0]}
                            alt={p.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="space-y-1 p-2">
                        <div className="truncate text-sm font-medium">
                          {p.title}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            cost {money(p.cost, currency)}
                          </span>
                          <span className="font-medium">
                            {money(p.price, currency)}
                          </span>
                        </div>
                        {margin != null && (
                          <Badge variant="secondary" className="text-[11px]">
                            +{money(margin, currency)} margin
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent orders</CardTitle>
            <CardDescription>Status, totals and shipping.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!orders?.length ? (
              <p className="text-muted-foreground p-6 text-sm">
                No orders synced yet.
              </p>
            ) : (
              <div className="divide-y">
                {orders.map((o) => {
                  const shipment = Array.isArray(o.shipments)
                    ? o.shipments[0]
                    : undefined;
                  return (
                    <div
                      key={o._id}
                      className="flex items-center gap-3 px-6 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            #{o.orderId}
                          </span>
                          <Badge variant="outline" className="text-[11px]">
                            {o.status ?? "—"}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground mt-0.5 truncate text-xs">
                          {o.address?.city
                            ? `${o.address.city}, ${o.address.country}`
                            : "—"}
                          {shipment?.carrier && ` · ${shipment.carrier}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium tabular-nums">
                          {money(o.totalPrice, o.currency ?? currency)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          cost {money(o.productionCost, o.currency ?? currency)}
                        </div>
                      </div>
                      {shipment?.url && (
                        <a
                          href={shipment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Track shipment"
                        >
                          <Truck className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
