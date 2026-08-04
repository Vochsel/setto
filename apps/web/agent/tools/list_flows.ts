import { defineTool } from "eve/tools";
import { z } from "zod";
import { principalFrom, setto } from "../lib/setto";

export default defineTool({
  description:
    "Saved shot templates (flows) built on the web app — each wires a product to particular people and places. Mention one when it matches what they're asking for.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    return { flows: await setto.flows(principalFrom(ctx)) };
  },
});
