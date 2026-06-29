/**
 * The "research + persona agents" brains behind campaign copy. Pure functions
 * (no Convex ctx) so both the explicit `researchCampaign` action and the
 * `generateCopy` action can share them.
 *
 *   deriveResearch   — strategist pass: positioning, audience personas, and an
 *                      art-direction brief. Optionally grounded with live web
 *                      search (OpenAI Responses API `web_search` tool).
 *   writeForPersona  — one copy agent, writing a variant tuned to one persona.
 */

import { nanoid } from "nanoid";
import { chatJSON, responsesWebSearch } from "./openai";

export interface StrategyCampaign {
  name: string;
  brief?: string | null;
  copy?: {
    headline?: string;
    tagline?: string;
    body?: string;
    cta?: string;
  } | null;
}

export interface DerivedPersona {
  id: string;
  name: string;
  descriptor?: string;
  motivation?: string;
  pains?: string;
  angle?: string;
}

export interface DerivedResearch {
  positioning?: string;
  insights?: string[];
  visualDirection?: { palette?: string; mood?: string; layoutCues?: string };
  sources?: string[];
  usedWeb?: boolean;
  generatedAt?: number;
}

function str(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim() : undefined;
}

const STRATEGIST_SYSTEM =
  "You are a sharp brand strategist and advertising planner. You turn a product " +
  "brief into a crisp positioning, a few distinct audience personas, and an " +
  "art-direction direction. Respond with strict JSON only — no prose, no markdown.";

function strategistInput(campaign: StrategyCampaign, useWeb: boolean): string {
  // Intentionally ignore any existing copy: generate fresh ideas from the brief
  // rather than rewriting what's already there.
  return (
    `Campaign: ${campaign.name}\n` +
    (campaign.brief ? `Brief: ${campaign.brief}\n` : "") +
    (useWeb
      ? "\nUse web search to ground your thinking in the real market: who buys " +
        "this kind of product, current trends, and how comparable brands " +
        "position themselves. Prefer recent, credible sources.\n"
      : "") +
    `\nReturn JSON of exactly this shape:\n` +
    `{\n` +
    `  "positioning": "1-2 sentences: the core promise and what sets it apart",\n` +
    `  "insights": ["3-5 short audience/market insights"],\n` +
    `  "visualDirection": { "palette": "colour direction", "mood": "tone & feel", "layoutCues": "composition & typography cues" },\n` +
    `  "personas": [ { "name": "short label", "descriptor": "who they are", "motivation": "what they want", "pains": "what frustrates them", "angle": "the message that lands" } ]\n` +
    `}\n` +
    `Give 3 distinct personas. Keep every string tight.`
  );
}

/** Strategist pass → research brief + 2-4 audience personas (with stable ids). */
export async function deriveResearch(opts: {
  model: string;
  campaign: StrategyCampaign;
  useWeb: boolean;
}): Promise<{ research: DerivedResearch; personas: DerivedPersona[] }> {
  const input = strategistInput(opts.campaign, opts.useWeb);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  let sources: string[] = [];
  let usedWeb = opts.useWeb;
  if (opts.useWeb) {
    try {
      const r = await responsesWebSearch({
        model: opts.model,
        instructions: STRATEGIST_SYSTEM,
        input,
      });
      raw = r.data;
      sources = r.sources;
    } catch {
      // Web search may be unavailable for the key/model — degrade gracefully
      // to a brief-only strategist rather than failing the whole run.
      usedWeb = false;
    }
  }
  if (!raw) {
    raw = await chatJSON({
      model: opts.model,
      system: STRATEGIST_SYSTEM,
      user: strategistInput(opts.campaign, false),
    });
  }

  const personas: DerivedPersona[] = (
    Array.isArray(raw?.personas) ? raw.personas : []
  )
    .slice(0, 4)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({
      id: nanoid(8),
      name: str(p?.name) ?? "Audience",
      descriptor: str(p?.descriptor),
      motivation: str(p?.motivation),
      pains: str(p?.pains),
      angle: str(p?.angle),
    }));

  const vd = raw?.visualDirection ?? {};
  const research: DerivedResearch = {
    positioning: str(raw?.positioning),
    insights: Array.isArray(raw?.insights)
      ? raw.insights
          .filter((x: unknown) => typeof x === "string" && x.trim())
          .map((x: string) => x.trim())
          .slice(0, 6)
      : undefined,
    visualDirection: {
      palette: str(vd?.palette),
      mood: str(vd?.mood),
      layoutCues: str(vd?.layoutCues),
    },
    sources: sources.length ? sources.slice(0, 8) : undefined,
    usedWeb,
    generatedAt: Date.now(),
  };

  return { research, personas };
}

/** One persona-tuned copy variant. */
export async function writeForPersona(opts: {
  model: string;
  campaign: StrategyCampaign;
  persona: DerivedPersona;
  positioning?: string;
  instructions?: string;
}): Promise<{
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}> {
  const p = opts.persona;
  const system =
    "You are a senior advertising copywriter. You write punchy, on-brand ad " +
    "copy tailored to a specific audience persona. Respond with strict JSON only.";
  const user =
    `Write one ad-copy option for this campaign, written to land with the persona below.\n\n` +
    `Campaign: ${opts.campaign.name}\n` +
    (opts.campaign.brief ? `Brief: ${opts.campaign.brief}\n` : "") +
    (opts.positioning ? `Positioning: ${opts.positioning}\n` : "") +
    `\nPersona: ${p.name}\n` +
    (p.descriptor ? `- Who: ${p.descriptor}\n` : "") +
    (p.motivation ? `- Wants: ${p.motivation}\n` : "") +
    (p.pains ? `- Frustrations: ${p.pains}\n` : "") +
    (p.angle ? `- Angle that lands: ${p.angle}\n` : "") +
    (opts.instructions ? `\nExtra direction: ${opts.instructions}\n` : "") +
    `\nReturn JSON of exactly this shape:\n` +
    `{"headline":"...","tagline":"...","body":"...","cta":"..."}\n` +
    `- headline: short, attention-grabbing (max ~8 words)\n` +
    `- tagline: a supporting line\n` +
    `- body: 1-2 sentences\n` +
    `- cta: 2-4 word call to action`;

  const raw = await chatJSON({
    model: opts.model,
    system,
    user,
  });
  return {
    headline: str(raw?.headline),
    tagline: str(raw?.tagline),
    body: str(raw?.body),
    cta: str(raw?.cta),
  };
}
