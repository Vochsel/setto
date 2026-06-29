import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { getTextModel, DEFAULT_TEXT_MODEL_ID } from "./lib/textModels";
import { deriveResearch } from "./lib/strategy";

/**
 * Research a campaign: derive positioning, audience personas, and an
 * art-direction brief from the campaign brief — optionally grounded with live
 * web search. Persists `research` + `personas` on the campaign so the copy
 * agents (convex/copy.ts) and the UI can use them. The user can re-run this and
 * edit everything downstream.
 */
export const researchCampaign = action({
  args: {
    campaignId: v.id("campaigns"),
    useWeb: v.optional(v.boolean()),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    // Enforces org ownership.
    const campaign = await ctx.runQuery(api.campaigns.get, {
      id: args.campaignId,
    });

    const model =
      getTextModel(args.modelKey ?? DEFAULT_TEXT_MODEL_ID) ??
      getTextModel(DEFAULT_TEXT_MODEL_ID)!;
    const useWeb = args.useWeb ?? false;

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

    try {
      const { research, personas } = await deriveResearch({
        model: model.openaiModel,
        campaign: {
          name: campaign.name,
          brief: campaign.brief ?? null,
          copy: campaign.copy ?? null,
        },
        useWeb,
      });

      await ctx.runMutation(internal.campaigns.saveResearch, {
        id: args.campaignId,
        research,
        personas,
      });
      await logUsage("succeeded");
      return { research, personas };
    } catch (e) {
      await logUsage("failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
});
