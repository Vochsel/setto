// Re-vendor the Remotion composition from the workspace packages into this
// self-contained render service (which must build without workspace deps for
// the Vercel Docker build). Run after changing the composition or spec:
//
//   pnpm --dir apps/render run sync   # or: node apps/render/scripts/sync.mjs
//
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..", "..");
const dst = path.join(here, "..", "remotion");

// video.ts is pure — a straight copy.
await copyFile(
  path.join(repo, "packages/core/src/video.ts"),
  path.join(dst, "video.ts"),
);

// index.ts has no @setto imports — straight copy.
await copyFile(
  path.join(repo, "packages/remotion/src/index.ts"),
  path.join(dst, "index.ts"),
);

// Timeline.tsx and Root.tsx import "@setto/core/video" — rewrite to "./video".
for (const file of ["Timeline.tsx", "Root.tsx"]) {
  const src = await readFile(
    path.join(repo, "packages/remotion/src", file),
    "utf8",
  );
  await writeFile(
    path.join(dst, file),
    src.replaceAll('"@setto/core/video"', '"./video"'),
  );
}

console.log("Synced vendored Remotion composition into apps/render/remotion");
