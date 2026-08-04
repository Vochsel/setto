"use client";

/**
 * The four node types a flow is built from.
 *
 * Each node is a thin editor over one field in `node.data` — the id of a
 * product / person / place, or the output's render settings. Everything else
 * (positions, selection, edges) is xyflow's business. The runner in
 * `convex/flows.ts` reads only `type` and those ids, so nodes can gain visual
 * detail here without the backend caring.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Package, Users, MapPin, Sparkles, Layers } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ASPECT_RATIOS } from "@/lib/format";
import {
  selectableImageModels,
  formatPrice,
  PROVIDER_LABEL,
  type ImageProvider,
} from "@/convex/lib/imageModels";

/** Every variant of the wired product, whatever they turn out to be at run time. */
export const ALL_VARIANTS = "*";
const AUTO_ASPECT = "__auto__";

export interface NodeOption {
  value: string;
  label: string;
  imageUrl?: string;
  variants?: { id: string; name: string }[];
}

/** Options + the update callback, handed to every node via xyflow's node data. */
export interface FlowNodeContext {
  products: NodeOption[];
  models: NodeOption[];
  locations: NodeOption[];
  update: (nodeId: string, patch: Record<string, unknown>) => void;
}

type Data = Record<string, unknown> & { ctx?: FlowNodeContext };

const shell =
  "bg-card w-64 rounded-xl border shadow-sm transition-colors [.selected_&]:border-primary";
const head = "flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium";

const out = (
  <Handle
    type="source"
    position={Position.Right}
    className="!size-2.5 !border-2 !bg-background"
  />
);

/* ───────────────────────────── product ───────────────────────────── */

export const ProductNode = memo(function ProductNode({ id, data }: NodeProps) {
  const d = data as Data;
  const ctx = d.ctx;
  const productId = typeof d.productId === "string" ? d.productId : undefined;
  const product = ctx?.products.find((p) => p.value === productId);
  const variantIds = Array.isArray(d.variantIds)
    ? (d.variantIds as string[])
    : [];
  const all = variantIds.includes(ALL_VARIANTS);

  const setVariants = (next: string[]) => ctx?.update(id, { variantIds: next });

  return (
    <div className={shell}>
      <div className={head}>
        <Package className="h-3.5 w-3.5" /> Product
        {product?.variants?.length ? (
          <Badge variant="secondary" className="ml-auto font-normal">
            {all ? product.variants.length : variantIds.length || 1} shot
            {(all ? product.variants.length : variantIds.length || 1) === 1
              ? ""
              : "s"}
          </Badge>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <Combobox
          value={productId}
          onChange={(v) => ctx?.update(id, { productId: v, variantIds: [] })}
          options={ctx?.products ?? []}
          placeholder="Pick a product"
          searchPlaceholder="Search products…"
          size="sm"
          className="nodrag"
        />
        {product?.variants?.length ? (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setVariants(all ? [] : [ALL_VARIANTS])}
              className={cn(
                "nodrag flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors",
                all
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <Layers className="h-3 w-3" /> Every variant
              <span className="text-muted-foreground ml-auto">
                {product.variants.length}
              </span>
            </button>
            {!all && (
              <div className="max-h-28 space-y-0.5 overflow-y-auto">
                {product.variants.map((vr) => {
                  const on = variantIds.includes(vr.id);
                  return (
                    <button
                      key={vr.id}
                      type="button"
                      onClick={() =>
                        setVariants(
                          on
                            ? variantIds.filter((x) => x !== vr.id)
                            : [...variantIds, vr.id],
                        )
                      }
                      className={cn(
                        "nodrag block w-full truncate rounded px-2 py-0.5 text-left text-xs transition-colors",
                        on ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                      )}
                    >
                      {vr.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {out}
    </div>
  );
});

/* ───────────────────────── model / location ───────────────────────── */

function PickerNode({
  id,
  data,
  kind,
}: {
  id: string;
  data: Data;
  kind: "model" | "location";
}) {
  const ctx = data.ctx;
  const key = kind === "model" ? "modelId" : "locationId";
  const value = typeof data[key] === "string" ? (data[key] as string) : undefined;
  const options = kind === "model" ? ctx?.models : ctx?.locations;
  const Icon = kind === "model" ? Users : MapPin;

  return (
    <div className={shell}>
      <div className={head}>
        <Icon className="h-3.5 w-3.5" /> {kind === "model" ? "Person" : "Location"}
      </div>
      <div className="p-3">
        <Combobox
          value={value}
          onChange={(v) => ctx?.update(id, { [key]: v })}
          options={options ?? []}
          placeholder={kind === "model" ? "Pick a person" : "Pick a location"}
          searchPlaceholder="Search…"
          size="sm"
          className="nodrag"
        />
      </div>
      {out}
    </div>
  );
}

export const ModelNode = memo(function ModelNode({ id, data }: NodeProps) {
  return <PickerNode id={id} data={data as Data} kind="model" />;
});

export const LocationNode = memo(function LocationNode({ id, data }: NodeProps) {
  return <PickerNode id={id} data={data as Data} kind="location" />;
});

/* ───────────────────────────── output ───────────────────────────── */

export const OutputNode = memo(function OutputNode({ id, data }: NodeProps) {
  const d = data as Data;
  const ctx = d.ctx;
  const modelKey = typeof d.modelKey === "string" ? d.modelKey : undefined;
  const models = selectableImageModels(modelKey);

  return (
    <div className={cn(shell, "w-72")}>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !bg-background"
      />
      <div className={head}>
        <Sparkles className="h-3.5 w-3.5" /> Output
      </div>
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Images each</Label>
            <Input
              type="number"
              min={1}
              max={6}
              value={Number(d.count) || 1}
              onChange={(e) =>
                ctx?.update(id, {
                  count: Math.max(1, Math.min(6, Number(e.target.value) || 1)),
                })
              }
              className="nodrag h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Aspect</Label>
            <Select
              value={typeof d.aspectRatio === "string" ? d.aspectRatio : AUTO_ASPECT}
              onValueChange={(v) =>
                ctx?.update(id, {
                  aspectRatio: v === AUTO_ASPECT ? undefined : v,
                })
              }
            >
              <SelectTrigger size="sm" className="nodrag w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_ASPECT}>Auto</SelectItem>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px]">Image model</Label>
          <Select
            value={modelKey ?? ""}
            onValueChange={(v) => ctx?.update(id, { modelKey: v })}
          >
            <SelectTrigger size="sm" className="nodrag w-full min-w-0">
              <SelectValue placeholder="Flow default" />
            </SelectTrigger>
            <SelectContent>
              {(["google", "openai", "fal"] as ImageProvider[]).map((prov) => (
                <SelectGroup key={prov}>
                  <SelectLabel>{PROVIDER_LABEL[prov]}</SelectLabel>
                  {models
                    .filter((m) => m.provider === prov)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="truncate">{m.label}</span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            ~{formatPrice(m.pricePerImage)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          value={typeof d.extraPrompt === "string" ? d.extraPrompt : ""}
          onChange={(e) => ctx?.update(id, { extraPrompt: e.target.value })}
          placeholder="Art direction — e.g. walking, looking away, golden hour…"
          className="nodrag min-h-[54px] text-sm"
        />
      </div>
    </div>
  );
});

export const nodeTypes = {
  product: ProductNode,
  model: ModelNode,
  location: LocationNode,
  output: OutputNode,
};
