import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // convex is a runtime dependency; @setto/core is bundled from source.
  external: ["convex"],
  noExternal: [/^@setto\//],
  banner: { js: "#!/usr/bin/env node" },
});
