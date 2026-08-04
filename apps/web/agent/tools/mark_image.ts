import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "Favourite or rate a photo — do this when they say they like (or dislike) one, so the good ones are easy to find later.",
  inputSchema: z.object({
    generationId: z.string().describe("image id from show_gallery"),
    favorite: z.boolean().optional(),
    rating: z.number().int().min(1).max(5).optional(),
  }),
  async execute(input, ctx) {
    return await setto.review(principalFrom(ctx), {
      generationId: input.generationId,
      favorite: input.favorite,
      rating: input.rating,
    });
  },
});
