"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Link2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { BrandBadge } from "@/components/integrations/brand-icon";

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

type ProviderDef = {
  id: "shopify" | "printify" | "buffer";
  name: string;
  blurb: string;
  secretLabel: string;
  secretPlaceholder: string;
  metaFields: Field[];
  help: { label: string; url: string };
};

const PROVIDERS: ProviderDef[] = [
  {
    id: "shopify",
    name: "Shopify",
    blurb: "Sync your product catalog in as wardrobe to shoot.",
    secretLabel: "Admin API access token",
    secretPlaceholder: "shpat_…",
    metaFields: [
      {
        key: "domain",
        label: "Store domain",
        placeholder: "your-store.myshopify.com",
        required: true,
      },
    ],
    help: {
      label: "Create a custom app",
      url: "https://help.shopify.com/en/manual/apps/app-types/custom-apps",
    },
  },
  {
    id: "printify",
    name: "Printify",
    blurb: "Production costs, orders and shipping for your products.",
    secretLabel: "Personal Access Token",
    secretPlaceholder: "eyJ…",
    metaFields: [],
    help: { label: "Get a token", url: "https://printify.com/app/account/api" },
  },
  {
    id: "buffer",
    name: "Buffer",
    blurb: "Schedule social posts from your shots and videos.",
    secretLabel: "Access token",
    secretPlaceholder: "1/…",
    metaFields: [],
    help: { label: "Developer settings", url: "https://developers.buffer.com" },
  },
];

type Connection = {
  provider: string;
  label?: string;
  meta?: unknown;
  status: string;
  lastError?: string;
  connectedAt: number;
  lastUsedAt?: number;
};

export function Connections() {
  const list = useQuery(api.integrations.list, {});
  const byProvider = new Map((list ?? []).map((c) => [c.provider, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Connections
        </CardTitle>
        <CardDescription>
          Connect your own store and social accounts. Keys are encrypted and
          private to you — teammates connect their own.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {PROVIDERS.map((p) => (
          <ProviderRow
            key={p.id}
            def={p}
            connection={byProvider.get(p.id) ?? null}
            loading={list === undefined}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ connection }: { connection: Connection | null }) {
  if (!connection)
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not connected
      </Badge>
    );
  if (connection.status === "connected")
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  if (connection.status === "error")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return <Badge variant="secondary">Unverified</Badge>;
}

function ProviderRow({
  def,
  connection,
  loading,
}: {
  def: ProviderDef;
  connection: Connection | null;
  loading: boolean;
}) {
  const connect = useAction(api.integrationsNode.connect);
  const test = useAction(api.integrationsNode.test);
  const disconnect = useMutation(api.integrations.disconnect);

  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function submit() {
    const missing = def.metaFields.find(
      (f) => f.required && !meta[f.key]?.trim(),
    );
    if (missing) return toast.error(`${missing.label} is required`);
    if (!secret.trim()) return toast.error(`${def.secretLabel} is required`);
    setBusy(true);
    try {
      const res = await connect({
        provider: def.id,
        secret: secret.trim(),
        meta,
      });
      if (res.ok) {
        toast.success(`${def.name} connected${res.label ? ` · ${res.label}` : ""}`);
        setOpen(false);
        setSecret("");
        setMeta({});
      } else {
        toast.error(res.error ?? `Could not verify ${def.name}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not connect ${def.name}`);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      const res = await test({ provider: def.id });
      if (res.ok) toast.success(`${def.name} is working`);
      else toast.error(res.error ?? `${def.name} check failed`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <BrandBadge provider={def.id} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{def.name}</span>
          {!loading && <StatusBadge connection={connection} />}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {connection?.status === "connected" && connection.label
            ? connection.label
            : connection?.status === "error" && connection.lastError
              ? connection.lastError
              : def.blurb}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {connection && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={runTest}
              disabled={testing}
              title="Re-check connection"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <ConfirmDelete
              onConfirm={async () => {
                await disconnect({ provider: def.id });
                toast.success(`${def.name} disconnected`);
              }}
              title={`Disconnect ${def.name}?`}
              description="Your key is deleted. Synced data stays."
              trigger={
                <Button variant="ghost" size="sm">
                  Disconnect
                </Button>
              }
            />
          </>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <Button
            variant={connection ? "outline" : "default"}
            size="sm"
            onClick={() => setOpen(true)}
          >
            {connection ? "Update key" : "Connect"}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BrandBadge provider={def.id} className="h-6 w-6" /> Connect{" "}
                {def.name}
              </DialogTitle>
              <DialogDescription>{def.blurb}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {def.metaFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`${def.id}-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`${def.id}-${f.key}`}
                    placeholder={f.placeholder}
                    value={meta[f.key] ?? ""}
                    onChange={(e) =>
                      setMeta((m) => ({ ...m, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor={`${def.id}-secret`}>{def.secretLabel}</Label>
                <Input
                  id={`${def.id}-secret`}
                  type="password"
                  autoComplete="off"
                  placeholder={def.secretPlaceholder}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
                <a
                  href={def.help.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                >
                  {def.help.label} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? "Verifying…" : "Connect"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
