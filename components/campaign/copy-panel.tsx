"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, Wand2, Globe, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL_ID } from "@/convex/lib/textModels";
import type { Id } from "@/convex/_generated/dataModel";

export interface AdCopy {
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

interface CopyVariant extends AdCopy {
  id: string;
  personaId?: string;
  personaName?: string;
  sources?: string[];
}

interface Persona {
  id: string;
  name: string;
  descriptor?: string;
  motivation?: string;
  pains?: string;
  angle?: string;
}

interface Research {
  positioning?: string;
  insights?: string[];
  visualDirection?: { palette?: string; mood?: string; layoutCues?: string };
  sources?: string[];
  usedWeb?: boolean;
}

export function CopyPanel({
  campaignId,
  brief,
  copy,
  copyVariants,
  personas,
  research,
}: {
  campaignId: Id<"campaigns">;
  brief?: string;
  copy?: AdCopy;
  copyVariants?: CopyVariant[];
  personas?: Persona[];
  research?: Research;
}) {
  const update = useMutation(api.campaigns.update);
  const setCopy = useMutation(api.campaigns.setCopy);
  const generateCopy = useAction(api.copy.generateCopy);
  const researchCampaign = useAction(api.research.researchCampaign);

  const [briefValue, setBriefValue] = useState(brief ?? "");
  const [headline, setHeadline] = useState(copy?.headline ?? "");
  const [tagline, setTagline] = useState(copy?.tagline ?? "");
  const [body, setBody] = useState(copy?.body ?? "");
  const [cta, setCta] = useState(copy?.cta ?? "");

  const [instructions, setInstructions] = useState("");
  const [modelKey, setModelKey] = useState(DEFAULT_TEXT_MODEL_ID);
  const [useWeb, setUseWeb] = useState(true);
  const [busy, setBusy] = useState<null | "research" | "copy">(null);

  const hasPersonas = (personas?.length ?? 0) > 0;

  function saveCopy(next: AdCopy) {
    setCopy({
      id: campaignId,
      copy: {
        headline: next.headline?.trim() || undefined,
        tagline: next.tagline?.trim() || undefined,
        body: next.body?.trim() || undefined,
        cta: next.cta?.trim() || undefined,
      },
    }).catch(() => toast.error("Could not save copy"));
  }

  // Full pipeline: research the audience, then write a variant per persona.
  async function runResearchAndWrite() {
    setBusy("research");
    try {
      await researchCampaign({ campaignId, useWeb, modelKey });
      setBusy("copy");
      await generateCopy({
        campaignId,
        instructions: instructions.trim() || undefined,
        modelKey,
      });
      toast.success("Researched the audience and wrote fresh copy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy generation failed");
    } finally {
      setBusy(null);
    }
  }

  // Cheaper path: keep the existing personas, just rewrite their copy.
  async function runRewrite() {
    setBusy("copy");
    try {
      await generateCopy({
        campaignId,
        instructions: instructions.trim() || undefined,
        modelKey,
      });
      toast.success("Copy ideas ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy generation failed");
    } finally {
      setBusy(null);
    }
  }

  function applyVariant(v: CopyVariant) {
    setHeadline(v.headline ?? "");
    setTagline(v.tagline ?? "");
    setBody(v.body ?? "");
    setCta(v.cta ?? "");
    saveCopy(v);
    toast.success("Applied to copy");
  }

  const busyLabel =
    busy === "research"
      ? "Researching…"
      : busy === "copy"
        ? "Writing copy…"
        : null;

  return (
    <Card className="gap-4 p-4">
      <div>
        <h2 className="text-sm font-medium">Brief &amp; copy</h2>
        <p className="text-muted-foreground text-xs">
          Describe the campaign, then let the research agents write the copy — or
          edit it yourself.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="brief">Brief</Label>
        <Textarea
          id="brief"
          value={briefValue}
          onChange={(e) => setBriefValue(e.target.value)}
          onBlur={() =>
            briefValue !== (brief ?? "") &&
            update({ id: campaignId, brief: briefValue.trim() || undefined })
          }
          placeholder="Product, audience, tone, goal…"
          className="min-h-[64px] text-sm"
        />
      </div>

      {/* Research + persona copy generation */}
      <div className="bg-muted/40 space-y-2.5 rounded-lg border p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Wand2 className="h-3.5 w-3.5" /> Research &amp; auto-write copy
        </span>
        <Input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional direction — e.g. playful, mention free shipping…"
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
          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <Globe className="text-muted-foreground h-3.5 w-3.5" />
            Web
            <Switch checked={useWeb} onCheckedChange={setUseWeb} />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={runResearchAndWrite}
            disabled={busy !== null}
            className="flex-1"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busyLabel ?? "Research & write"}
          </Button>
          {hasPersonas && (
            <Button
              size="sm"
              variant="outline"
              onClick={runRewrite}
              disabled={busy !== null}
            >
              Rewrite
            </Button>
          )}
        </div>

        {/* Strategy summary */}
        {(research?.positioning ||
          (research?.insights?.length ?? 0) > 0 ||
          hasPersonas) && (
          <div className="space-y-2 pt-0.5">
            {research?.positioning && (
              <p className="text-muted-foreground text-[11px] leading-snug">
                {research.positioning}
              </p>
            )}
            {hasPersonas && (
              <div className="flex flex-wrap items-center gap-1">
                <Users className="text-muted-foreground h-3 w-3" />
                {personas!.map((p) => (
                  <Tooltip key={p.id}>
                    <TooltipTrigger asChild>
                      <span className="bg-background cursor-default rounded border px-1.5 py-0.5 text-[10px]">
                        {p.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-60 text-xs">
                      {[p.descriptor, p.motivation && `Wants: ${p.motivation}`, p.angle && `Angle: ${p.angle}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
            {((research?.insights?.length ?? 0) > 0 ||
              (research?.sources?.length ?? 0) > 0) && (
              <details className="text-[11px]">
                <summary className="text-muted-foreground cursor-pointer select-none">
                  Research notes
                  {research?.usedWeb && research?.sources?.length
                    ? ` · ${research.sources.length} sources`
                    : ""}
                </summary>
                <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4">
                  {research?.insights?.map((ins, i) => <li key={i}>{ins}</li>)}
                </ul>
                {research?.sources && research.sources.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {research.sources.slice(0, 6).map((s, i) => (
                      <li key={i} className="truncate">
                        <a
                          href={s}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {s}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </div>
        )}

        {copyVariants && copyVariants.length > 0 && (
          <div className="space-y-2 pt-1">
            {copyVariants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => applyVariant(v)}
                className={cn(
                  "group hover:border-primary bg-background block w-full rounded-md border p-2.5 text-left transition-colors",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {v.personaName && (
                      <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
                        {v.personaName}
                      </p>
                    )}
                    {v.headline && (
                      <p className="truncate text-sm font-medium">
                        {v.headline}
                      </p>
                    )}
                    {v.tagline && (
                      <p className="text-muted-foreground truncate text-xs">
                        {v.tagline}
                      </p>
                    )}
                    {v.body && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {v.body}
                      </p>
                    )}
                    {v.cta && (
                      <span className="bg-primary/10 text-primary mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px]">
                        {v.cta}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground group-hover:text-primary flex shrink-0 items-center gap-1 text-[11px]">
                    <Check className="h-3 w-3" /> Use
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Working copy fields */}
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Big, attention-grabbing line"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Supporting line"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="1–2 sentences of detail"
            className="min-h-[52px] text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cta">Call to action</Label>
          <Input
            id="cta"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            onBlur={() => saveCopy({ headline, tagline, body, cta })}
            placeholder="Shop now"
          />
        </div>
      </div>
    </Card>
  );
}
