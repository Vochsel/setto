import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

/**
 * The one tool that spends money.
 *
 * iMessage has no buttons, so eve's approval UI has nothing to render into —
 * the confirmation has to happen in the conversation. `confirmedByUser` makes
 * that requirement explicit in the tool call itself rather than leaving it to
 * the system prompt alone: the model has to assert it, and the assertion shows
 * up in the trace when it was wrong. The hard count cap is the backstop that
 * bounds the damage either way.
 */
export default defineTool({
  description:
    "Generate photos of a product, optionally on a specific person and at a specific location. COSTS MONEY — around $0.016 an image on the default model. Ask first, in the conversation, and only call this once they've agreed to this specific batch. Images take about a minute; check show_gallery afterwards for the results.",
  inputSchema: z.object({
    productId: z.string().describe("from list_products"),
    variantId: z
      .string()
      .optional()
      .describe("a specific colourway; omit for the product as-is"),
    modelId: z.string().optional().describe("person to wear it, from list_cast"),
    locationId: z.string().optional().describe("where to shoot, from list_cast"),
    prompt: z
      .string()
      .optional()
      .describe("art direction, e.g. 'walking, looking away, golden hour'"),
    count: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("how many images (default 1, hard max 4 per call)"),
    modelKey: z
      .string()
      .optional()
      .describe(
        "image model; defaults to the cheap tier. Only override when they've asked for higher quality.",
      ),
    confirmedByUser: z
      .boolean()
      .describe(
        "true only if this person has agreed, in this conversation, to generate this specific batch",
      ),
  }),
  async execute(input, ctx) {
    if (!input.confirmedByUser) {
      return {
        generated: false,
        reason:
          "Not confirmed. Tell them what you'd shoot and roughly what it costs, then wait for a yes.",
      };
    }
    const result = await setto.generate(principalFrom(ctx), {
      productId: input.productId,
      variantId: input.variantId,
      modelId: input.modelId,
      locationId: input.locationId,
      prompt: input.prompt,
      count: input.count ?? 1,
      modelKey: input.modelKey,
    });
    return {
      generated: true,
      ...(result as object),
      note: "Generating now — takes about a minute. Call show_gallery for this product to get the finished URLs.",
    };
  },
});
