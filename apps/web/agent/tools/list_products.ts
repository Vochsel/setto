import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "List the store's products with how many finished photos each already has. Use onlyUnshot:true to find what still needs photographing — that's the question behind most requests.",
  inputSchema: z.object({
    onlyUnshot: z
      .boolean()
      .optional()
      .describe("only products with zero finished photos"),
    query: z.string().optional().describe("match on name or description"),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(input, ctx) {
    const products = await setto.products(principalFrom(ctx), {
      onlyUnshot: input.onlyUnshot,
      query: input.query,
      limit: input.limit ?? 20,
    });
    return { count: (products as unknown[]).length, products };
  },
});
