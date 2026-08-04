import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "Pull the connected Shopify store's catalogue into setto — new products are created, existing ones updated in place. Free and safe to run whenever new stock is mentioned.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(250).optional(),
  }),
  async execute(input, ctx) {
    return await setto.syncShopify(principalFrom(ctx), { limit: input.limit });
  },
});
