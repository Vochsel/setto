import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { nanoid } from "nanoid";
import {
  getTextModel,
  DEFAULT_TEXT_MODEL_ID,
  type TextModel,
} from "./lib/textModels";

interface CopyVariant {
  id: string;
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

/** Call the OpenAI chat completions API and return parsed JSON content. */
async function callOpenAIChat(
  model: TextModel,
  apiKey: string,
  args: { system: string; user: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const openaiModel = process.env.OPENAI_TEXT_MODEL ?? model.openaiModel;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `OpenAI error ${res.status}`);
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no copy");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned malformed JSON");
  }
}

/**
 * Generate ad copy for a campaign with GPT. Returns a handful of variants
 * (headline / tagline / body / CTA) and also persists them on the campaign so
 * they survive a reload. The user applies one to the working copy from the UI.
 */
export const generateCopy = action({
  args: {
    campaignId: v.id("campaigns"),
    count: v.optional(v.number()),
    instructions: v.optional(v.string()),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ variants: CopyVariant[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    // Pull the campaign (this also enforces org ownership).
    const campaign = await ctx.runQuery(api.campaigns.get, {
      id: args.campaignId,
    });

    const model =
      getTextModel(args.modelKey ?? DEFAULT_TEXT_MODEL_ID) ??
      getTextModel(DEFAULT_TEXT_MODEL_ID)!;

    const logUsage = (status: "succeeded" | "failed", error?: string) =>
      ctx.runMutation(internal.usage.record, {
        orgId,
        userId,
        kind: "campaign_copy" as const,
        provider: model.provider,
        modelKey: model.id,
        modelLabel: model.label,
        status,
        campaignId: args.campaignId,
        isText: true,
        error,
      });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const msg =
        "OPENAI_API_KEY is not set. Run: npx convex env set OPENAI_API_KEY <key>";
      await logUsage("failed", msg);
      throw new Error(msg);
    }

    const count = Math.min(Math.max(args.count ?? 3, 1), 5);
    const existing = campaign.copy
      ? `Current working copy (improve on or diverge from it):\n${JSON.stringify(
          campaign.copy,
        )}`
      : "";

    const system =
      "You are a senior advertising copywriter. You write punchy, on-brand ad " +
      "copy. Always respond with strict JSON only.";
    const user =
      `Write ${count} distinct ad copy options for this campaign.\n\n` +
      `Campaign name: ${campaign.name}\n` +
      (campaign.brief ? `Brief: ${campaign.brief}\n` : "") +
      (args.instructions ? `Extra direction: ${args.instructions}\n` : "") +
      (existing ? `${existing}\n` : "") +
      `\nReturn JSON of exactly this shape:\n` +
      `{"variants":[{"headline":"...","tagline":"...","body":"...","cta":"..."}]}\n` +
      `- headline: short, attention-grabbing (max ~8 words)\n` +
      `- tagline: a supporting line\n` +
      `- body: 1-2 sentences\n` +
      `- cta: 2-4 word call to action\n` +
      `Make each option meaningfully different in angle and tone.`;

    try {
      const parsed = await callOpenAIChat(model, apiKey, { system, user });
      const rawVariants: unknown[] = Array.isArray(parsed?.variants)
        ? parsed.variants
        : Array.isArray(parsed)
          ? parsed
          : [];
      const variants: CopyVariant[] = rawVariants
        .slice(0, count)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({
          id: nanoid(8),
          headline:
            typeof r?.headline === "string" ? r.headline.trim() : undefined,
          tagline:
            typeof r?.tagline === "string" ? r.tagline.trim() : undefined,
          body: typeof r?.body === "string" ? r.body.trim() : undefined,
          cta: typeof r?.cta === "string" ? r.cta.trim() : undefined,
        }))
        .filter((x) => x.headline || x.tagline || x.body || x.cta);

      if (!variants.length) throw new Error("No usable copy was generated");

      await ctx.runMutation(internal.campaigns.saveCopyVariants, {
        id: args.campaignId,
        variants,
      });
      await logUsage("succeeded");
      return { variants };
    } catch (e) {
      await logUsage("failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
});
