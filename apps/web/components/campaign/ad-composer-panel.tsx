"use client";

import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Trash2,
  AlertCircle,
  Download,
  RefreshCw,
  Replace,
  LayoutTemplate,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL_ID } from "@/convex/lib/textModels";
import type { Id } from "@/convex/_generated/dataModel";

/* ─────────────────────────── helpers ─────────────────────────── */

interface AdSlot {
  id: string;
  label?: string;
  kind: "image" | "video";
  mediaUrl?: string;
  posterUrl?: string;
  source?: string;
  sourceId?: string;
}

interface AdDoc {
  _id: Id<"campaignAds">;
  status: "queued" | "generating" | "succeeded" | "failed";
  html?: string;
  slots?: AdSlot[];
  error?: string;
  aspectRatio?: string;
}

const mediaProxy = (url: string) =>
  `/api/media-proxy?url=${encodeURIComponent(url)}`;

const aspectToCss = (ratio?: string) =>
  ratio && /^\d+:\d+$/.test(ratio) ? ratio.replace(":", " / ") : "4 / 5";

/** Build the sandboxed iframe document: Tailwind + media + an export hook. */
function buildSrcDoc(html: string, slots: AdSlot[]): string {
  let body = html;
  for (const s of slots) {
    const token = new RegExp(`\\{\\{\\s*slot:${s.id}\\s*\\}\\}`, "g");
    let el: string;
    if (s.mediaUrl) {
      const src = mediaProxy(s.mediaUrl);
      el =
        s.kind === "video"
          ? `<video src="${src}" crossorigin="anonymous" autoplay loop muted playsinline class="w-full h-full object-cover"></video>`
          : `<img src="${src}" crossorigin="anonymous" class="w-full h-full object-cover" alt="" />`;
    } else {
      el = `<div class="w-full h-full flex items-center justify-center bg-neutral-200 text-neutral-400 text-xs">${
        s.label ?? s.id
      }</div>`;
    }
    body = body.replace(token, el);
  }
  // Any slot the layout declared but we didn't bind → neutral placeholder.
  body = body.replace(
    /\{\{\s*slot:[a-zA-Z0-9_-]+\s*\}\}/g,
    `<div class="w-full h-full bg-neutral-200"></div>`,
  );

  return `<!doctype html><html><head><meta charset="utf-8" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<style>html,body{margin:0;padding:0;height:100%;width:100%}*{box-sizing:border-box}</style>
</head>
<body class="h-full w-full">${body}
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11/dist/html-to-image.js"></script>
<script>
window.addEventListener('message', async function (e) {
  var d = e.data || {};
  if (d.type !== 'export-png') return;
  try {
    if (!window.htmlToImage) throw new Error('renderer not ready');
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    var url = await window.htmlToImage.toPng(document.body, { pixelRatio: d.pixelRatio || 2, cacheBust: true });
    parent.postMessage({ type: 'export-png-result', id: d.id, dataUrl: url }, '*');
  } catch (err) {
    parent.postMessage({ type: 'export-png-error', id: d.id, error: String((err && err.message) || err) }, '*');
  }
});
</script>
</body></html>`;
}

/** Ask the iframe to rasterize itself; resolves with a PNG data URL. */
function exportPng(iframe: HTMLIFrameElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data;
      if (!d || d.id !== id) return;
      if (d.type === "export-png-result") {
        cleanup();
        resolve(d.dataUrl as string);
      } else if (d.type === "export-png-error") {
        cleanup();
        reject(new Error(d.error || "Export failed"));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Export timed out"));
    }, 20000);
    function cleanup() {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
    }
    window.addEventListener("message", onMsg);
    iframe.contentWindow?.postMessage({ type: "export-png", id, pixelRatio: 2 }, "*");
  });
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadVideo(url: string) {
  const res = await fetch(mediaProxy(url));
  const blob = await res.blob();
  const ext = blob.type.includes("quicktime") ? "mov" : "mp4";
  const href = URL.createObjectURL(blob);
  triggerDownload(href, `setto-ad-${Date.now()}.${ext}`);
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/* ─────────────────────────── panel ─────────────────────────── */

export function AdComposerPanel({
  campaignId,
  aspectRatio,
  hasCopy,
}: {
  campaignId: Id<"campaigns">;
  aspectRatio?: string;
  hasCopy: boolean;
}) {
  const ads = useQuery(api.ads.listByCampaign, { campaignId }) as
    | AdDoc[]
    | undefined;
  const generateAdLayout = useAction(api.ads.generateAdLayout);

  const [instructions, setInstructions] = useState("");
  const [modelKey, setModelKey] = useState(DEFAULT_TEXT_MODEL_ID);
  const [generating, setGenerating] = useState(false);

  async function runGenerate() {
    setGenerating(true);
    try {
      await generateAdLayout({
        campaignId,
        instructions: instructions.trim() || undefined,
        modelKey,
      });
      toast.success("Designing your ad…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the layout");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="gap-4 p-4">
      <div>
        <h2 className="text-sm font-medium">Ad composer</h2>
        <p className="text-muted-foreground text-xs">
          AI lays out a real HTML ad — swap in any shot, creative or video, then
          download it.
        </p>
      </div>

      <Input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional art direction — e.g. bold, minimal, dark background…"
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-2">
        <Select value={modelKey} onValueChange={setModelKey}>
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={runGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate ad
        </Button>
      </div>

      {!hasCopy && (
        <p className="text-muted-foreground rounded-md border border-dashed px-2.5 py-1.5 text-[11px]">
          Tip: write some copy above — the layout renders your headline, body and
          CTA as real text.
        </p>
      )}

      {ads === undefined ? (
        <div
          className="bg-muted/50 w-full animate-pulse rounded-md"
          style={{ aspectRatio: aspectToCss(aspectRatio) }}
        />
      ) : ads.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-xs">
          <LayoutTemplate className="h-5 w-5" />
          No ads composed yet.
        </div>
      ) : (
        <div className="space-y-4">
          {ads.map((ad) => (
            <AdTile key={ad._id} ad={ad} campaignId={campaignId} />
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────── one ad ─────────────────────────── */

function AdTile({
  ad,
  campaignId,
}: {
  ad: AdDoc;
  campaignId: Id<"campaigns">;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const regenerate = useAction(api.ads.regenerateAd);
  const removeAd = useMutation(api.ads.removeAd);
  const setAdSlot = useMutation(api.ads.setAdSlot);

  const [busy, setBusy] = useState<null | "download" | "regen">(null);
  const slots = ad.slots ?? [];
  const videoSlot = slots.find((s) => s.kind === "video" && s.mediaUrl);

  async function download() {
    setBusy("download");
    try {
      if (videoSlot?.mediaUrl) {
        await downloadVideo(videoSlot.mediaUrl);
        return;
      }
      if (!iframeRef.current) throw new Error("Preview not ready");
      const dataUrl = await exportPng(iframeRef.current);
      triggerDownload(dataUrl, `setto-ad-${Date.now()}.png`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function runRegen() {
    setBusy("regen");
    try {
      await regenerate({ adId: ad._id });
      toast.success("Redesigning…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-2">
      {/* Preview */}
      <div
        className="bg-muted relative w-full overflow-hidden rounded-md"
        style={{ aspectRatio: aspectToCss(ad.aspectRatio) }}
      >
        {ad.status === "succeeded" && ad.html ? (
          <iframe
            ref={iframeRef}
            title="Ad preview"
            sandbox="allow-scripts"
            className="h-full w-full border-0"
            srcDoc={buildSrcDoc(ad.html, slots)}
          />
        ) : ad.status === "failed" ? (
          <div className="text-destructive flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center text-xs">
            <AlertCircle className="h-4 w-4" />
            <span className="leading-tight">{ad.error ?? "Failed"}</span>
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Slot swappers */}
      {ad.status === "succeeded" && slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <SlotMediaPicker
              key={s.id}
              campaignId={campaignId}
              slot={s}
              onPick={(media) =>
                setAdSlot({ adId: ad._id, slotId: s.id, ...media }).catch(() =>
                  toast.error("Could not swap media"),
                )
              }
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {ad.status === "succeeded" && (
          <Button
            size="sm"
            variant="outline"
            onClick={download}
            disabled={busy !== null}
            className="flex-1"
          >
            {busy === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {videoSlot ? "Download video" : "Download PNG"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={runRegen}
          disabled={busy !== null || ad.status === "generating"}
        >
          {busy === "regen" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => removeAd({ adId: ad._id })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── slot picker ─────────────────────────── */

interface PickedMedia {
  kind: "image" | "video";
  source: string;
  sourceId: string;
  mediaUrl?: string;
  posterUrl?: string;
}

function SlotMediaPicker({
  campaignId,
  slot,
  onPick,
}: {
  campaignId: Id<"campaigns">;
  slot: AdSlot;
  onPick: (media: PickedMedia) => void;
}) {
  const [open, setOpen] = useState(false);
  // Only query the media lists when the picker is open.
  const shots = useQuery(api.generations.listByOrg, open ? {} : "skip");
  const creatives = useQuery(
    api.campaignCreatives.listByCampaign,
    open ? { campaignId } : "skip",
  );
  const videos = useQuery(api.videos.listByOrg, open ? {} : "skip");

  function pick(media: PickedMedia) {
    onPick(media);
    setOpen(false);
  }

  const creativeImgs = (creatives ?? []).filter(
    (c) => c.status === "succeeded" && c.imageUrl,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-muted/60 hover:bg-muted flex items-center gap-1 rounded border px-1.5 py-1 text-[11px]"
        title={`Swap "${slot.label ?? slot.id}"`}
      >
        <Replace className="h-3 w-3" />
        <span className="max-w-24 truncate">{slot.label ?? slot.id}</span>
      </button>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Swap media · {slot.label ?? slot.id}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="shots">
          <TabsList>
            <TabsTrigger value="shots">Shots</TabsTrigger>
            <TabsTrigger value="creatives">Creatives</TabsTrigger>
            <TabsTrigger value="videos">Videos</TabsTrigger>
          </TabsList>

          <TabsContent value="shots">
            <MediaGrid
              loading={shots === undefined}
              empty="No shots yet."
              items={(shots ?? [])
                .filter((g) => g.imageUrl)
                .map((g) => ({
                  key: g._id,
                  url: g.imageUrl!,
                  onPick: () =>
                    pick({
                      kind: "image",
                      source: "shot",
                      sourceId: g._id,
                      mediaUrl: g.imageUrl,
                    }),
                }))}
            />
          </TabsContent>

          <TabsContent value="creatives">
            <MediaGrid
              loading={creatives === undefined}
              empty="No creatives yet."
              items={creativeImgs.map((c) => ({
                key: c._id,
                url: c.imageUrl!,
                onPick: () =>
                  pick({
                    kind: "image",
                    source: "creative",
                    sourceId: c._id,
                    mediaUrl: c.imageUrl,
                  }),
              }))}
            />
          </TabsContent>

          <TabsContent value="videos">
            <MediaGrid
              loading={videos === undefined}
              empty="No videos yet."
              items={(videos ?? [])
                .filter((vd) => vd.videoUrl)
                .map((vd) => ({
                  key: vd._id,
                  url: vd.posterUrl ?? vd.videoUrl!,
                  isVideo: true,
                  onPick: () =>
                    pick({
                      kind: "video",
                      source: "video",
                      sourceId: vd._id,
                      mediaUrl: vd.videoUrl,
                      posterUrl: vd.posterUrl,
                    }),
                }))}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MediaGrid({
  loading,
  empty,
  items,
}: {
  loading: boolean;
  empty: string;
  items: { key: string; url: string; isVideo?: boolean; onPick: () => void }[];
}) {
  return (
    <div className="max-h-[60vh] overflow-y-auto pt-2">
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/50 aspect-[3/4] animate-pulse rounded-md"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">{empty}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={it.onPick}
              className="hover:border-primary relative aspect-[3/4] overflow-hidden rounded-md border-2 border-transparent transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt="" className="h-full w-full object-cover" />
              {it.isVideo && (
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] text-white">
                  video
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
