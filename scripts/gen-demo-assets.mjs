#!/usr/bin/env node
/**
 * Generate the landing-page Studio demo assets via fal.
 *
 * The landing page (`apps/web/app/page.tsx`) embeds an interactive studio
 * preview (`components/landing/studio-demo.tsx`) backed by static files under
 * `apps/web/public/demo/`. This script produces those files: location
 * backdrops, model headshots, the per-variation fashion portraits, and a few
 * image-to-video clips. Filenames here MUST match `apps/web/lib/demo-data.ts`.
 *
 * Usage:
 *
 *   FAL_KEY=xxxxxxxx node scripts/gen-demo-assets.mjs
 *
 * Environment variables:
 *
 *   FAL_KEY               (required)  your fal API key — https://fal.ai/dashboard/keys
 *   DEMO_IMAGE_ENDPOINT   (optional)  text-to-image model      [default: fal-ai/flux/dev]
 *   DEMO_VIDEO_ENDPOINT   (optional)  image-to-video model     [default: fal-ai/kling-video/v2.5-turbo/pro/image-to-video]
 *   DEMO_VIDEO_DURATION   (optional)  clip length in seconds   [default: 5]
 *   DEMO_SKIP_VIDEO       (optional)  set to "1" to skip the (pricier) clips
 *   FORCE                 (optional)  set to "1" to regenerate files that already exist
 *
 * It's safe to re-run: existing files are skipped unless FORCE=1, so an
 * interrupted run resumes where it left off. Approx fal spend for a full run is
 * a couple of dollars (15 images + 3 short clips).
 */

import { fal } from "@fal-ai/client";
import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "apps", "web", "public", "demo");

const IMAGE_ENDPOINT = process.env.DEMO_IMAGE_ENDPOINT || "fal-ai/flux/dev";
const VIDEO_ENDPOINT =
  process.env.DEMO_VIDEO_ENDPOINT ||
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
const VIDEO_DURATION = process.env.DEMO_VIDEO_DURATION || "5";
const SKIP_VIDEO = process.env.DEMO_SKIP_VIDEO === "1";
const FORCE = process.env.FORCE === "1";

// Shared style suffix so every render reads as one coherent campaign.
const PHOTO =
  "Editorial fashion photography, photorealistic, 35mm, natural light, " +
  "shallow depth of field, high detail, muted filmic color grade.";

/** @type {{file:string, prompt:string, size:string}[]} */
const IMAGES = [
  // ── Locations (landscape backdrops) ──────────────────────────────
  {
    file: "loc-tokyo.jpg",
    size: "landscape_4_3",
    prompt:
      "Neon-lit Shibuya scramble crossing in Tokyo at dusk, glowing billboards, " +
      "wet asphalt reflections, no people in foreground, establishing street shot. " +
      PHOTO,
  },
  {
    file: "loc-rome.jpg",
    size: "landscape_4_3",
    prompt:
      "Narrow cobblestone Trastevere alley in Rome, ochre and terracotta walls, " +
      "ivy, hanging laundry, warm late-afternoon light, empty street. " +
      PHOTO,
  },
  {
    file: "loc-nyc.jpg",
    size: "landscape_4_3",
    prompt:
      "SoHo cast-iron building facades in New York, fire escapes, cobblestone " +
      "street, soft overcast light, empty sidewalk, establishing shot. " +
      PHOTO,
  },

  // ── Models (round-cropped headshots) ─────────────────────────────
  {
    file: "model-maya.jpg",
    size: "square_hd",
    prompt:
      "Studio headshot portrait of a 27-year-old woman with warm brown skin and " +
      "dark coiled hair, confident relaxed expression, neutral grey backdrop, " +
      "soft beauty lighting, centered. " +
      PHOTO,
  },
  {
    file: "model-jonas.jpg",
    size: "square_hd",
    prompt:
      "Studio headshot portrait of a 31-year-old man with fair skin, light " +
      "stubble and tousled sandy hair, easy friendly expression, neutral grey " +
      "backdrop, soft lighting, centered. " +
      PHOTO,
  },
  {
    file: "model-aria.jpg",
    size: "square_hd",
    prompt:
      "Studio headshot portrait of a 24-year-old East Asian woman with a sleek " +
      "black bob, poised editorial expression, neutral grey backdrop, soft " +
      "lighting, centered. " +
      PHOTO,
  },

  // ── Outfit variations (full-length fashion portraits, 3:4) ───────
  // Suit — on Maya, Shibuya
  look("suit-sand", "Maya, a woman with warm brown skin and dark coiled hair",
    "a relaxed double-breasted sand-beige linen suit with a tonal open-collar shirt and leather loafers",
    "a neon-lit Shibuya crossing in Tokyo at dusk"),
  look("suit-olive", "Maya, a woman with warm brown skin and dark coiled hair",
    "a relaxed double-breasted muted-olive linen suit with a cream open-collar shirt and leather loafers",
    "a neon-lit Shibuya crossing in Tokyo at dusk"),
  look("suit-charcoal", "Maya, a woman with warm brown skin and dark coiled hair",
    "a relaxed double-breasted charcoal linen suit with a slate open-collar shirt and leather loafers",
    "a neon-lit Shibuya crossing in Tokyo at dusk"),

  // Denim — on Jonas, Trastevere
  look("denim-indigo", "Jonas, a man with fair skin, light stubble and sandy hair",
    "an oversized deep-indigo raw denim jacket with matching straight-leg jeans, a white tee and sneakers",
    "a cobblestone Trastevere alley in Rome"),
  look("denim-stonewash", "Jonas, a man with fair skin, light stubble and sandy hair",
    "an oversized light stonewash denim jacket with matching straight-leg jeans, a white tee and sneakers",
    "a cobblestone Trastevere alley in Rome"),
  look("denim-black", "Jonas, a man with fair skin, light stubble and sandy hair",
    "an oversized washed-black denim jacket with matching straight-leg jeans, a white tee and sneakers",
    "a cobblestone Trastevere alley in Rome"),

  // Trench — on Aria, SoHo
  look("trench-camel", "Aria, a woman with a sleek black bob",
    "a long belted camel gabardine trench coat over a knit top and tailored trousers with ankle boots",
    "a SoHo cast-iron street in New York"),
  look("trench-cream", "Aria, a woman with a sleek black bob",
    "a long belted soft-cream trench coat over a knit top and tailored trousers with ankle boots",
    "a SoHo cast-iron street in New York"),
  look("trench-forest", "Aria, a woman with a sleek black bob",
    "a long belted deep forest-green trench coat over a knit top and tailored trousers with ankle boots",
    "a SoHo cast-iron street in New York"),
];

/** Image-to-video clips. `from` is the still they animate (must be an IMAGES file). */
const VIDEOS = [
  {
    file: "suit-sand.mp4",
    from: "suit-sand.jpg",
    prompt:
      "Subtle cinematic motion: the model shifts weight and turns slightly " +
      "toward camera, fabric drapes, background neon flickers softly. Locked-off " +
      "camera, slow push-in.",
  },
  {
    file: "denim-indigo.mp4",
    from: "denim-indigo.jpg",
    prompt:
      "Subtle cinematic motion: the model takes a relaxed step and adjusts the " +
      "denim jacket, warm light flickers in the alley. Locked-off camera, slow " +
      "push-in.",
  },
  {
    file: "trench-camel.mp4",
    from: "trench-camel.jpg",
    prompt:
      "Subtle cinematic motion: the trench coat sways as the model turns toward " +
      "camera, overcast city light. Locked-off camera, slow push-in.",
  },
];

function look(file, subject, outfit, place) {
  return {
    file: `${file}.jpg`,
    size: "portrait_4_3",
    prompt:
      `Full-length editorial fashion photograph of ${subject}, wearing ${outfit}, ` +
      `standing on location at ${place}, candid relaxed pose, full body in frame. ` +
      PHOTO,
  };
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function firstUrl(data) {
  // Tolerate the common fal output shapes.
  if (data?.images?.[0]?.url) return data.images[0].url;
  if (data?.image?.url) return data.image.url;
  if (data?.video?.url) return data.video.url;
  if (Array.isArray(data?.video) && data.video[0]?.url) return data.video[0].url;
  throw new Error(`could not find a result URL in: ${JSON.stringify(data).slice(0, 300)}`);
}

async function main() {
  const key = process.env.FAL_KEY;
  if (!key) {
    console.error(
      "✗ FAL_KEY is not set.\n" +
        "  Get a key at https://fal.ai/dashboard/keys, then:\n" +
        "    FAL_KEY=xxxx node scripts/gen-demo-assets.mjs",
    );
    process.exit(1);
  }
  fal.config({ credentials: key });
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`→ Output:  ${OUT_DIR}`);
  console.log(`→ Image:   ${IMAGE_ENDPOINT}`);
  console.log(`→ Video:   ${SKIP_VIDEO ? "(skipped)" : VIDEO_ENDPOINT}\n`);

  /** Remember each still's fal-hosted URL so videos can animate it directly. */
  const remoteUrls = {};
  let made = 0;
  let skipped = 0;

  // ── Images ───────────────────────────────────────────────────────
  for (const img of IMAGES) {
    const dest = join(OUT_DIR, img.file);
    if (!FORCE && (await exists(dest))) {
      console.log(`• skip   ${img.file} (exists)`);
      skipped++;
      continue;
    }
    process.stdout.write(`… image  ${img.file} `);
    try {
      const { data } = await fal.subscribe(IMAGE_ENDPOINT, {
        input: {
          prompt: img.prompt,
          image_size: img.size,
          num_images: 1,
          enable_safety_checker: true,
        },
      });
      const url = firstUrl(data);
      remoteUrls[img.file] = url;
      await download(url, dest);
      console.log("✓");
      made++;
    } catch (e) {
      console.log("✗");
      console.error(`   ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Videos ───────────────────────────────────────────────────────
  if (!SKIP_VIDEO) {
    for (const vid of VIDEOS) {
      const dest = join(OUT_DIR, vid.file);
      if (!FORCE && (await exists(dest))) {
        console.log(`• skip   ${vid.file} (exists)`);
        skipped++;
        continue;
      }
      // Need a remote URL for the source still. Prefer the one fal just gave us;
      // otherwise upload the local file we downloaded earlier.
      let imageUrl = remoteUrls[vid.from];
      if (!imageUrl) {
        const srcPath = join(OUT_DIR, vid.from);
        if (!(await exists(srcPath))) {
          console.log(`• skip   ${vid.file} (source ${vid.from} missing)`);
          skipped++;
          continue;
        }
        const { readFile } = await import("node:fs/promises");
        const buf = await readFile(srcPath);
        imageUrl = await fal.storage.upload(
          new Blob([buf], { type: "image/jpeg" }),
        );
      }
      process.stdout.write(`… video  ${vid.file} `);
      try {
        const { data } = await fal.subscribe(VIDEO_ENDPOINT, {
          input: {
            prompt: vid.prompt,
            image_url: imageUrl,
            duration: VIDEO_DURATION,
          },
        });
        await download(firstUrl(data), dest);
        console.log("✓");
        made++;
      } catch (e) {
        console.log("✗");
        console.error(`   ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(`\nDone. ${made} generated, ${skipped} skipped → ${OUT_DIR}`);
  console.log("Commit the new files under apps/web/public/demo/ to ship them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
