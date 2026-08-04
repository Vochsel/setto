import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "The people (models) and locations available to shoot products with. Pass their ids to generate_product_shot.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    return await setto.cast(principalFrom(ctx));
  },
});
