import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { nanoid } from "nanoid";
import { getTextModel, DEFAULT_TEXT_MODEL_ID } from "./lib/textModels";
import {
  deriveResearch,
  writeForPersona,
  type DerivedPersona,
} from "./lib/strategy";

interface CopyVariant {
  id: string;
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
  personaId?: string;
  personaName?: string;
  sources?: string[];
}

/**
 * Generate ad copy for a campaign with a panel of persona agents: each derived
 * audience persona gets its own copywriter that writes one variant tuned to it.
 * Personas come from the research step (convex/research.ts); if none exist yet
 * we derive a quick set (no web) so this still works on its own. Variants are
 * persisted on the campaign and remain fully editable in the UI.
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

    const strategyCampaign = {
      name: campaign.name,
      brief: campaign.brief ?? null,
      copy: campaign.copy ?? null,
    };

    try {
      // Ensure we have personas to write for. If research hasn't run, derive a
      // quick set (no web search) and persist it so the UI reflects it.
      let personas: DerivedPersona[] = (campaign.personas ??
        []) as DerivedPersona[];
      let positioning = campaign.research?.positioning;
      let sources = campaign.research?.sources;
      if (personas.length === 0) {
        const derived = await deriveResearch({
          model: model.openaiModel,
          campaign: strategyCampaign,
          useWeb: false,
        });
        personas = derived.personas;
        positioning = derived.research.positioning;
        sources = derived.research.sources;
        await ctx.runMutation(internal.campaigns.saveResearch, {
          id: args.campaignId,
          research: derived.research,
          personas,
        });
      }

      const cap = Math.min(personas.length, 4);
      const n = args.count ? Math.min(Math.max(args.count, 1), cap) : cap;
      const targets = personas.slice(0, n);

      // One copy agent per persona, in parallel. Use allSettled so a single
      // failed agent doesn't discard the variants that did succeed.
      const settled = await Promise.allSettled(
        targets.map((persona) =>
          writeForPersona({
            model: model.openaiModel,
            campaign: strategyCampaign,
            persona,
            positioning,
            instructions: args.instructions,
          }).then(
            (v) =>
              ({
                id: nanoid(8),
                ...v,
                personaId: persona.id,
                personaName: persona.name,
                sources: sources?.slice(0, 3),
              }) satisfies CopyVariant,
          ),
        ),
      );

      const variants: CopyVariant[] = [];
      for (const r of settled) {
        if (
          r.status === "fulfilled" &&
          (r.value.headline ||
            r.value.tagline ||
            r.value.body ||
            r.value.cta)
        ) {
          variants.push(r.value);
        }
      }

      if (!variants.length) {
        // Surface the real reason (e.g. quota / billing) rather than a generic.
        const rejected = settled.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        if (rejected) {
          throw rejected.reason instanceof Error
            ? rejected.reason
            : new Error(String(rejected.reason));
        }
        throw new Error("No usable copy was generated");
      }

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
