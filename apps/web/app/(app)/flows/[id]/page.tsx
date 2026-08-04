"use client";

/**
 * The flow editor: an xyflow canvas over `flows.graph`.
 *
 * Editing is local and autosaved — the graph is one JSON blob, so there's
 * nothing to reconcile field by field, and a debounce keeps a drag from writing
 * on every frame. The run panel deliberately estimates before it spends: a
 * three-node graph can expand to dozens of images, and the count is not obvious
 * from looking at it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Package,
  Users,
  MapPin,
  Sparkles,
  Loader2,
  Play,
  Calculator,
  Images,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { nodeTypes, type FlowNodeContext } from "@/components/flow/flow-nodes";
import { formatPrice } from "@/convex/lib/imageModels";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

const AUTOSAVE_MS = 800;

interface EstimateResult {
  images: number;
  estimatedCostUsd: number;
  maxImages: number;
  withinCap: boolean;
}

export default function FlowEditorPage() {
  const params = useParams<{ id: string }>();
  const flowId = params.id as Id<"flows">;
  const router = useRouter();

  const flow = useQuery(api.flows.get, { id: flowId });
  const products = useQuery(api.products.list, {});
  const people = useQuery(api.models.list, {});
  const places = useQuery(api.locations.list, {});
  const runs = useQuery(api.flows.runs, { flowId, limit: 24 });

  const update = useMutation(api.flows.update);
  const estimateFlow = useAction(api.flows.estimate);
  const runFlow = useAction(api.flows.run);

  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [estimate, setEstimate] = useState<{
    signature: string;
    result: EstimateResult;
  } | null>(null);
  const [busy, setBusy] = useState<"estimate" | "run" | null>(null);
  const [allVariants, setAllVariants] = useState(false);

  // The graph is only seeded from the server once; after that this editor owns
  // it, or every autosave would echo back and fight the user's next drag.
  const seeded = useRef(false);
  useEffect(() => {
    if (!flow || seeded.current) return;
    seeded.current = true;
    setName(flow.name);
    setNodes((flow.graph?.nodes ?? []) as Node[]);
    setEdges((flow.graph?.edges ?? []) as Edge[]);
  }, [flow]);

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [],
  );

  // Options for the pickers inside nodes. Passed through node data (xyflow has
  // no context of its own) and stripped again before saving.
  const ctx: FlowNodeContext = useMemo(
    () => ({
      products: (products ?? []).map((p) => ({
        value: p._id,
        label: p.name,
        imageUrl: p.imageUrls?.[0]?.url,
        variants: p.variants?.map((vr) => ({ id: vr.id, name: vr.name })),
      })),
      models: (people ?? []).map((m) => ({
        value: m._id,
        label: m.name,
        imageUrl: m.imageUrls?.[0]?.url,
      })),
      locations: (places ?? []).map((l) => ({ value: l._id, label: l.name })),
      update: updateNodeData,
    }),
    [products, people, places, updateNodeData],
  );

  const nodesWithCtx = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, ctx } })),
    [nodes, ctx],
  );

  // Autosave. `ctx` is injected for rendering only — it holds callbacks and the
  // whole library, neither of which belongs in the database.
  useEffect(() => {
    if (!seeded.current || !flow) return;
    const t = setTimeout(() => {
      const clean = nodes.map(({ id, type, position, data }) => {
        const rest = { ...(data ?? {}) } as Record<string, unknown>;
        delete rest.ctx;
        return { id, type, position, data: rest };
      });
      update({
        id: flowId,
        graph: {
          nodes: clean,
          edges: edges.map(({ id, source, target }) => ({ id, source, target })),
        },
      }).catch(() => toast.error("Could not save flow"));
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // An estimate belongs to the graph it was computed from. Rather than clearing
  // it on every edit, tag it with a signature and only show it while that still
  // matches — a stale "$0.38 for 24 images" beside a graph that now says
  // something else is worse than showing nothing.
  const signature = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map((n) => {
          const data = { ...(n.data ?? {}) } as Record<string, unknown>;
          delete data.ctx;
          return { id: n.id, type: n.type, data };
        }),
        edges: edges.map((e) => [e.source, e.target]),
        allVariants,
      }),
    [nodes, edges, allVariants],
  );
  const currentEstimate =
    estimate?.signature === signature ? estimate.result : null;

  function addNode(type: "product" | "model" | "location" | "output") {
    const id = `${type}-${Math.round(performance.now())}`;
    const column = { product: 40, model: 40, location: 40, output: 460 }[type];
    setNodes((ns) => [
      ...ns,
      {
        id,
        type,
        position: { x: column, y: 60 + ns.length * 40 },
        data: type === "output" ? { count: 1 } : {},
      },
    ]);
  }

  async function doEstimate() {
    setBusy("estimate");
    try {
      // Estimating reads the *saved* graph, so let the debounce land first.
      await new Promise((r) => setTimeout(r, AUTOSAVE_MS + 150));
      const r = (await estimateFlow({
        flowId,
        allVariants,
      })) as unknown as EstimateResult;
      setEstimate({ signature, result: r });
      if (!r.images) toast.info("This flow doesn't expand to any images yet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not estimate");
    } finally {
      setBusy(null);
    }
  }

  async function doRun() {
    setBusy("run");
    try {
      await new Promise((r) => setTimeout(r, AUTOSAVE_MS + 150));
      const r = (await runFlow({ flowId, allVariants })) as unknown as {
        images: number;
      };
      toast.success(`Generating ${r.images} image${r.images === 1 ? "" : "s"}…`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run flow");
    } finally {
      setBusy(null);
    }
  }

  if (flow === undefined) {
    return (
      <>
        <PageHeader title="Flow" />
        <div className="p-4 md:p-6">
          <Skeleton className="h-[70vh] rounded-xl" />
        </div>
      </>
    );
  }
  if (flow === null) {
    return (
      <>
        <PageHeader title="Flow" />
        <div className="p-6">
          <p className="text-muted-foreground text-sm">This flow is gone.</p>
          <Button className="mt-4" onClick={() => router.push("/flows")}>
            Back to flows
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Link href="/flows">
              <Button variant="ghost" size="icon" className="size-7">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                name !== flow.name && update({ id: flowId, name }).catch(() => {})
              }
              className="h-8 max-w-xs border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-input"
            />
          </div>
        }
      >
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => addNode("product")}>
            <Package className="h-4 w-4" /> Product
          </Button>
          <Button variant="outline" size="sm" onClick={() => addNode("model")}>
            <Users className="h-4 w-4" /> Person
          </Button>
          <Button variant="outline" size="sm" onClick={() => addNode("location")}>
            <MapPin className="h-4 w-4" /> Location
          </Button>
          <Button variant="outline" size="sm" onClick={() => addNode("output")}>
            <Sparkles className="h-4 w-4" /> Output
          </Button>
        </div>
      </PageHeader>

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[1fr_320px]">
        <Card className="h-[70vh] overflow-hidden p-0">
          <ReactFlow
            nodes={nodesWithCtx}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c: NodeChange[]) =>
              setNodes((ns) => applyNodeChanges(c, ns))
            }
            onEdgesChange={(c: EdgeChange[]) =>
              setEdges((es) => applyEdgeChanges(c, es))
            }
            onConnect={(c: Connection) => setEdges((es) => addEdge(c, es))}
            fitView
            proOptions={{ hideAttribution: false }}
            className="bg-muted/20"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </Card>

        <div className="space-y-4">
          <Card className="gap-3 p-4">
            <h3 className="text-sm font-medium">Run</h3>
            <p className="text-muted-foreground text-xs">
              Every product (and variant) is combined with every person and place
              wired into an output node.
            </p>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="all-variants" className="text-xs font-normal">
                Expand every variant
              </Label>
              <Switch
                id="all-variants"
                checked={allVariants}
                onCheckedChange={setAllVariants}
              />
            </div>

            {currentEstimate ? (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  currentEstimate.withinCap
                    ? "border-border bg-muted/40"
                    : "border-destructive/40 bg-destructive/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {currentEstimate.images} image
                    {currentEstimate.images === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums">
                    ~{formatPrice(currentEstimate.estimatedCostUsd)}
                  </span>
                </div>
                {!currentEstimate.withinCap ? (
                  <p className="text-destructive mt-1">
                    Over the cap of {currentEstimate.maxImages} — narrow the graph or
                    raise the limit before running.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={doEstimate}
                disabled={busy !== null}
              >
                {busy === "estimate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                Estimate
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={doRun}
                disabled={busy !== null || currentEstimate?.withinCap === false}
              >
                {busy === "run" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run
              </Button>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Images className="h-4 w-4" /> Produced
              {runs?.length ? (
                <Badge variant="secondary" className="ml-auto font-normal">
                  {runs.length}
                </Badge>
              ) : null}
            </h3>
            {!runs?.length ? (
              <p className="text-muted-foreground text-xs">
                Nothing yet — run the flow to fill this in.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {runs.map((g) => (
                  <div
                    key={g._id}
                    className="bg-muted relative aspect-square overflow-hidden rounded-md"
                    title={g.status}
                  >
                    {g.thumbnailUrl || g.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.thumbnailUrl ?? g.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
                        {g.status}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
