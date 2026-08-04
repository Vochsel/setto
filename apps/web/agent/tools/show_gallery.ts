import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "Finished photos, newest first, with their URLs. Narrow to one product, or to favourites. Use this to check whether generations finished and to send someone their images.",
  inputSchema: z.object({
    productId: z.string().optional(),
    favouritesOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  async execute(input, ctx) {
    const images = await setto.gallery(principalFrom(ctx), {
      productId: input.productId,
      favouritesOnly: input.favouritesOnly,
      limit: input.limit ?? 6,
    });
    return { count: (images as unknown[]).length, images };
  },
});
