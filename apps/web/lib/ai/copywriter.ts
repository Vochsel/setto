/**
 * The "research + persona copywriter" brains behind campaign copy, ported to the
 * Vercel AI SDK (`generateObject` for structured output, OpenAI's built-in
 * web_search tool for live market grounding). These run server-side inside the
 * streaming chat route (app/api/campaigns/[id]/copy-chat), exposed to the chat
 * model as the `researchAudience` and `writeCopy` tools.
 *
 *   deriveResearch  — strategist pass: positioning, audience personas, and an
 *                     art-direction brief; optionally grounded with web search.
 *   writeForPersona — one copy agent, writing a variant tuned to one persona.
 */

import { generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getTextModel,
  DEFAULT_TEXT_MODEL_ID,
  type TextModel,
} from "@/convex/lib/textModels";

export interface StrategyCampaign {
  name: string;
  brief?: string | null;
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

export interface CopyDraft {
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

/** Resolve a registry entry from a model key, falling back to the default. */
export function resolveTextModel(modelKey?: string): TextModel {
  return (
    getTextModel(modelKey ?? DEFAULT_TEXT_MODEL_ID) ??
    getTextModel(DEFAULT_TEXT_MODEL_ID)!
  );
}

/**
 * The provider model to send to. Honors the OPENAI_TEXT_MODEL override (same as
 * the rest of the app) and uses the Responses API (the default), which supports
 * the built-in web_search tool.
 */
function providerModel(registry: TextModel) {
  return openai(process.env.OPENAI_TEXT_MODEL ?? registry.openaiModel);
}

function str(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() ? x.trim() : undefined;
}

const STRATEGIST_SYSTEM =
  "You are a sharp brand strategist and advertising planner. You turn a product " +
  "brief into a crisp positioning, a few distinct audience personas, and an " +
  "art-direction direction.";

const researchSchema = z.object({
  positioning: z
    .string()
    .describe("1-2 sentences: the core promise and what sets it apart"),
  insights: z
    .array(z.string())
    .describe("3-5 short audience/market insights"),
  visualDirection: z.object({
    palette: z.string().describe("colour direction"),
    mood: z.string().describe("tone & feel"),
    layoutCues: z.string().describe("composition & typography cues"),
  }),
  personas: z
    .array(
      z.object({
        name: z.string().describe("short label"),
        descriptor: z.string().describe("who they are"),
        motivation: z.string().describe("what they want"),
        pains: z.string().describe("what frustrates them"),
        angle: z.string().describe("the message that lands for them"),
      }),
    )
    .describe("3 distinct audience personas"),
});

function strategistPrompt(
  campaign: StrategyCampaign,
  focus?: string,
  grounding?: string,
): string {
  return (
    `Campaign: ${campaign.name}\n` +
    (campaign.brief ? `Brief: ${campaign.brief}\n` : "") +
    (focus ? `Extra direction: ${focus}\n` : "") +
    (grounding ? `\nMarket notes from web research:\n${grounding}\n` : "") +
    `\nDerive the positioning, 3 distinct audience personas, and an ` +
    `art-direction direction. Keep every string tight.`
  );
}

/** Strategist pass → research brief + 2-4 audience personas (with stable ids). */
export async function deriveResearch(opts: {
  modelKey?: string;
  campaign: StrategyCampaign;
  focus?: string;
  useWeb?: boolean;
}): Promise<{ research: DerivedResearch; personas: DerivedPersona[] }> {
  const registry = resolveTextModel(opts.modelKey);
  const model = providerModel(registry);

  // Optionally ground the strategist with live web search. Degrade gracefully:
  // web search may be unavailable for the key/model — fall back to brief-only.
  let grounding: string | undefined;
  let sources: string[] = [];
  let usedWeb = false;
  if (opts.useWeb) {
    try {
      const research = await generateText({
        model,
        system:
          "You research the real market for a product brief: who buys it, " +
          "current trends, and how comparable brands position themselves. " +
          "Prefer recent, credible sources. Summarize what you find concisely.",
        prompt:
          `Campaign: ${opts.campaign.name}\n` +
          (opts.campaign.brief ? `Brief: ${opts.campaign.brief}\n` : "") +
          (opts.focus ? `Focus: ${opts.focus}\n` : "") +
          `\nResearch the market and summarize the key findings.`,
        tools: { web_search: openai.tools.webSearch() },
        toolChoice: { type: "tool", toolName: "web_search" },
      });
      grounding = research.text || undefined;
      sources = (research.sources ?? [])
        .map((s) => (s.sourceType === "url" ? s.url : undefined))
        .filter((u): u is string => Boolean(u));
      usedWeb = true;
    } catch {
      usedWeb = false;
    }
  }

  const { object } = await generateObject({
    model,
    schema: researchSchema,
    system: STRATEGIST_SYSTEM,
    prompt: strategistPrompt(opts.campaign, opts.focus, grounding),
  });

  const personas: DerivedPersona[] = object.personas.slice(0, 4).map((p) => ({
    id: nanoid(8),
    name: str(p.name) ?? "Audience",
    descriptor: str(p.descriptor),
    motivation: str(p.motivation),
    pains: str(p.pains),
    angle: str(p.angle),
  }));

  const research: DerivedResearch = {
    positioning: str(object.positioning),
    insights: object.insights
      .map((x) => str(x))
      .filter((x): x is string => Boolean(x))
      .slice(0, 6),
    visualDirection: {
      palette: str(object.visualDirection.palette),
      mood: str(object.visualDirection.mood),
      layoutCues: str(object.visualDirection.layoutCues),
    },
    sources: sources.length ? sources.slice(0, 8) : undefined,
    usedWeb,
    generatedAt: Date.now(),
  };

  return { research, personas };
}

const copySchema = z.object({
  headline: z.string().describe("short, attention-grabbing (max ~8 words)"),
  tagline: z.string().describe("a supporting line"),
  body: z.string().describe("1-2 sentences"),
  cta: z.string().describe("2-4 word call to action"),
});

/** One persona-tuned copy variant. */
export async function writeForPersona(opts: {
  modelKey?: string;
  campaign: StrategyCampaign;
  persona: DerivedPersona;
  positioning?: string;
  instructions?: string;
}): Promise<CopyDraft> {
  const registry = resolveTextModel(opts.modelKey);
  const p = opts.persona;
  const { object } = await generateObject({
    model: providerModel(registry),
    schema: copySchema,
    system:
      "You are a senior advertising copywriter. You write punchy, on-brand ad " +
      "copy tailored to a specific audience persona.",
    prompt:
      `Write one ad-copy option for this campaign, written to land with the persona below.\n\n` +
      `Campaign: ${opts.campaign.name}\n` +
      (opts.campaign.brief ? `Brief: ${opts.campaign.brief}\n` : "") +
      (opts.positioning ? `Positioning: ${opts.positioning}\n` : "") +
      `\nPersona: ${p.name}\n` +
      (p.descriptor ? `- Who: ${p.descriptor}\n` : "") +
      (p.motivation ? `- Wants: ${p.motivation}\n` : "") +
      (p.pains ? `- Frustrations: ${p.pains}\n` : "") +
      (p.angle ? `- Angle that lands: ${p.angle}\n` : "") +
      (opts.instructions ? `\nExtra direction: ${opts.instructions}\n` : ""),
  });
  return {
    headline: str(object.headline),
    tagline: str(object.tagline),
    body: str(object.body),
    cta: str(object.cta),
  };
}
