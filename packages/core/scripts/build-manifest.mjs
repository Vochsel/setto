#!/usr/bin/env node
/**
 * Regenerate packages/core/manifest.json from the live Convex deployment.
 * Usage (from packages/core): pnpm manifest
 *   (pipes `convex function-spec` stdout into this script)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const arr = Array.isArray(parsed) ? parsed : parsed.functions || [];
  const out = arr
    .filter((f) => f?.visibility?.kind === "public" && /:/.test(f.identifier || ""))
    .map((f) => ({
      path: (f.identifier || "").replace(/\.js:/, ":"),
      type: f.functionType, // Query | Mutation | Action
      args: f.args ?? null,
      returns: f.returns ?? null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "manifest.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.error(`Wrote ${out.length} public functions to manifest.json`);
});
