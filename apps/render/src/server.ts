import { createServer, type IncomingMessage } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  ensureBrowser,
} from "@remotion/renderer";
import { put } from "@vercel/blob";

const PORT = Number(process.env.PORT || 80);
const RENDER_SECRET = process.env.RENDER_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const here = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_ENTRY = path.join(here, "..", "remotion", "index.ts");

// Bundle the Remotion project once and reuse the webpack output across renders.
// Fluid Compute keeps the instance warm, so this cost is paid once per instance.
let serveUrlPromise: Promise<string> | null = null;
function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) {
    serveUrlPromise = (async () => {
      await ensureBrowser();
      return bundle({ entryPoint: REMOTION_ENTRY });
    })();
  }
  return serveUrlPromise;
}
// Warm the bundle in the background as soon as the instance boots.
void getServeUrl().catch((e) => console.error("Initial bundle failed:", e));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return json(200, { ok: true, service: "setto-render" });
    }

    if (req.method === "POST" && req.url === "/render") {
      if (RENDER_SECRET) {
        if (req.headers["authorization"] !== `Bearer ${RENDER_SECRET}`) {
          return json(401, { error: "unauthorized" });
        }
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      const spec = body.spec;
      if (!spec || !Array.isArray(spec.clips) || spec.clips.length === 0) {
        return json(400, { error: "missing or empty spec" });
      }

      const serveUrl = await getServeUrl();
      const composition = await selectComposition({
        serveUrl,
        id: "Timeline",
        inputProps: spec,
      });

      const dir = await mkdtemp(path.join(tmpdir(), "setto-render-"));
      const outputLocation = path.join(dir, "out.mp4");
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        inputProps: spec,
        outputLocation,
      });

      const data = await readFile(outputLocation);
      const safeName = String(body.name || "video")
        .replace(/[^a-z0-9-_]+/gi, "-")
        .slice(0, 60);
      const blob = await put(`videos/${safeName}-${body.renderId ?? "r"}.mp4`, data, {
        access: "public",
        contentType: "video/mp4",
        token: BLOB_TOKEN,
        addRandomSuffix: true,
      });

      return json(200, { url: blob.url });
    }

    return json(404, { error: "not found" });
  } catch (e) {
    console.error("Render error:", e);
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`setto-render listening on :${PORT}`);
});
