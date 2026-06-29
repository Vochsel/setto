/**
 * Streaming copywriter chat for a campaign.
 *
 * This is the AI-SDK heart of the campaign copy writer: a `streamText` loop that
 * the user talks to, with the old one-shot flows ("research the audience",
 * "write copy") exposed as tools the model calls. Tools do their work with the
 * AI SDK (`generateObject` in lib/ai/copywriter) and persist to Convex:
 *   - `researchAudience` → campaigns.setResearch (positioning + personas)
 *   - `writeCopy`        → copyVariants.add (appends to the growing library)
 *   - `setWorkingCopy`   → campaigns.setCopy (the copy used on creatives)
 *
 * Auth: WorkOS AuthKit (`withAuth`) gives the user's access token, which is the
 * JWT Convex validates — so the Convex client below acts as the user and all
 * org-scoping / usage logging is preserved. The chat thread is persisted in
 * Convex (copyChat) so it survives reloads.
 */

import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  deriveResearch,
  writeForPersona,
  resolveTextModel,
  type DerivedPersona,
} from "@/lib/ai/copywriter";

// Streaming can run a few tool steps; give it room.
export const maxDuration = 120;

function errorText(e: unknown): string {
  if (e == null) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

function clean(s?: string): string | undefined {
  return s?.trim() ? s.trim() : undefined;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const campaignId = id as Id<"campaigns">;

  const { accessToken } = await withAuth({ ensureSignedIn: true });
  if (!accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new Response("NEXT_PUBLIC_CONVEX_URL is not set", { status: 500 });
  }
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(accessToken);

  const {
    message,
    modelKey,
  }: { message: UIMessage; modelKey?: string } = await req.json();

  // Load the campaign (enforces org ownership) and the persisted thread.
  let campaign;
  try {
    campaign = await convex.query(api.campaigns.get, { id: campaignId });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const previous = (await convex.query(api.copyChat.get, {
    campaignId,
  })) as UIMessage[];

  const registry = resolveTextModel(modelKey);
  const model = openai(process.env.OPENAI_TEXT_MODEL ?? registry.openaiModel);
  const strategyCampaign = { name: campaign.name, brief: campaign.brief ?? null };

  // Mutable strategy context, updated when `researchAudience` runs this turn.
  let personas: DerivedPersona[] = (campaign.personas ?? []) as DerivedPersona[];
  let positioning = campaign.research?.positioning;
  let researchSources = campaign.research?.sources;

  const logUsage = (status: "succeeded" | "failed", error?: string) =>
    convex
      .mutation(api.usage.logCopy, {
        modelKey: registry.id,
        modelLabel: registry.label,
        status,
        campaignId,
        error,
      })
      .catch(() => {});

  const tools = {
    researchAudience: tool({
      description:
        "Research the campaign's audience and market: derive a crisp " +
        "positioning, 3 distinct audience personas, and an art-direction " +
        "direction. Use this before writing copy if the audience hasn't been " +
        "researched, or when the user wants fresh strategy. Set useWeb when the " +
        "user wants it grounded in live market/competitor research.",
      inputSchema: z.object({
        useWeb: z
          .boolean()
          .optional()
          .describe("Ground the research with live web search."),
        focus: z
          .string()
          .optional()
          .describe("Optional extra direction from the user."),
      }),
      execute: async ({ useWeb, focus }) => {
        try {
          const { research, personas: derived } = await deriveResearch({
            modelKey,
            campaign: strategyCampaign,
            focus,
            useWeb,
          });
          personas = derived;
          positioning = research.positioning;
          researchSources = research.sources;
          await convex.mutation(api.campaigns.setResearch, {
            id: campaignId,
            research,
            personas: derived,
          });
          await logUsage("succeeded");
          return {
            positioning: research.positioning,
            usedWeb: research.usedWeb,
            sources: research.sources,
            personas: derived.map((p) => ({
              name: p.name,
              descriptor: p.descriptor,
              angle: p.angle,
            })),
          };
        } catch (e) {
          await logUsage("failed", errorText(e));
          return { error: errorText(e) };
        }
      },
    }),

    writeCopy: tool({
      description:
        "Write fresh ad-copy options — one per audience persona — and save them " +
        "to the campaign's copy library. The options are persisted (the user " +
        "sees them in the library UI), so don't paste the full copy back in " +
        "chat; just briefly summarize what you wrote. Researches the audience " +
        "first if needed.",
      inputSchema: z.object({
        count: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("How many options to write (defaults to one per persona)."),
        instructions: z
          .string()
          .optional()
          .describe("Extra direction, e.g. tone, an offer to mention."),
        personaNames: z
          .array(z.string())
          .optional()
          .describe("Limit to these persona names (defaults to all)."),
      }),
      execute: async ({ count, instructions, personaNames }) => {
        try {
          if (personas.length === 0) {
            const derived = await deriveResearch({
              modelKey,
              campaign: strategyCampaign,
              useWeb: false,
            });
            personas = derived.personas;
            positioning = derived.research.positioning;
            researchSources = derived.research.sources;
            await convex.mutation(api.campaigns.setResearch, {
              id: campaignId,
              research: derived.research,
              personas: derived.personas,
            });
          }

          let targets = personas;
          if (personaNames?.length) {
            const want = new Set(personaNames.map((n) => n.toLowerCase()));
            const filtered = personas.filter((p) =>
              want.has(p.name.toLowerCase()),
            );
            if (filtered.length) targets = filtered;
          }
          const cap = Math.min(targets.length, 4);
          const n = count ? Math.min(Math.max(count, 1), cap) : cap;
          targets = targets.slice(0, n);

          const settled = await Promise.allSettled(
            targets.map((persona) =>
              writeForPersona({
                modelKey,
                campaign: strategyCampaign,
                persona,
                positioning,
                instructions,
              }),
            ),
          );

          const variants = [];
          for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (
              r.status === "fulfilled" &&
              (r.value.headline ||
                r.value.tagline ||
                r.value.body ||
                r.value.cta)
            ) {
              variants.push({
                headline: r.value.headline,
                tagline: r.value.tagline,
                body: r.value.body,
                cta: r.value.cta,
                personaName: targets[i].name,
                angle: targets[i].angle,
                sources: researchSources?.slice(0, 3),
              });
            }
          }

          if (!variants.length) {
            const rejected = settled.find((r) => r.status === "rejected") as
              | PromiseRejectedResult
              | undefined;
            const reason = rejected
              ? errorText(rejected.reason)
              : "No usable copy was generated";
            await logUsage("failed", reason);
            return { error: reason };
          }

          await convex.mutation(api.copyVariants.add, { campaignId, variants });
          await logUsage("succeeded");
          return {
            written: variants.length,
            items: variants.map((v) => ({
              personaName: v.personaName,
              headline: v.headline,
            })),
          };
        } catch (e) {
          await logUsage("failed", errorText(e));
          return { error: errorText(e) };
        }
      },
    }),

    setWorkingCopy: tool({
      description:
        "Set the campaign's working copy — the headline/tagline/body/CTA used " +
        "on the actual creatives. Use this when the user picks an option to go " +
        "with, or asks you to apply specific copy.",
      inputSchema: z.object({
        headline: z.string().optional(),
        tagline: z.string().optional(),
        body: z.string().optional(),
        cta: z.string().optional(),
      }),
      execute: async ({ headline, tagline, body, cta }) => {
        try {
          const copy = {
            headline: clean(headline),
            tagline: clean(tagline),
            body: clean(body),
            cta: clean(cta),
          };
          await convex.mutation(api.campaigns.setCopy, { id: campaignId, copy });
          return { applied: true, copy };
        } catch (e) {
          return { error: errorText(e) };
        }
      },
    }),
  };

  // Append the new message to the persisted thread, normalizing it. (Tool parts
  // come from these same tools, so we don't re-validate against their schemas —
  // which also sidesteps a generics-variance friction in validateUIMessages.)
  const incoming = [...previous, message];
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: incoming });
  } catch {
    messages = incoming;
  }

  const personaList = personas.length
    ? personas.map((p) => p.name).join(", ")
    : "none yet";

  const result = streamText({
    model,
    system:
      "You are the copywriter for an ad campaign, working alongside the user in " +
      "a chat. You help research the audience and write punchy, on-brand ad " +
      "copy.\n\n" +
      `Campaign: ${strategyCampaign.name}\n` +
      (strategyCampaign.brief ? `Brief: ${strategyCampaign.brief}\n` : "") +
      `Known audience personas: ${personaList}\n\n` +
      "Use your tools to do the work: `researchAudience` to derive positioning " +
      "and personas, `writeCopy` to generate options (they're saved to the " +
      "user's copy library automatically), and `setWorkingCopy` when the user " +
      "settles on copy to use on the creatives. Keep your chat replies short " +
      "and conversational — when you write copy, just summarize what you made " +
      "and point the user to the library rather than pasting it all back. If a " +
      "tool returns an `error`, tell the user plainly what went wrong.",
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(6),
  });

  // Keep generating even if the client disconnects, so the thread is saved.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onError: errorText,
      onEnd: ({ messages }) => {
        convex
          .mutation(api.copyChat.save, {
            campaignId,
            messages,
          })
          .catch(() => {});
      },
    }),
  });
}
