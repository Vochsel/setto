/**
 * Static content for the landing-page Studio demo (`components/landing/
 * studio-demo.tsx`). This is *not* wired to Convex or fal — it's a curated,
 * deterministic snapshot of what a real workspace holds, so the marketing page
 * can show the actual product surface (pick a location → model → outfit →
 * generate → animate) without auth, a backend, or live API keys.
 *
 * The image/video assets it references live under `public/demo/` and are
 * produced by `scripts/gen-demo-assets.mjs` (run once with a `FAL_KEY`). Until
 * that script runs the files may be absent; the demo degrades to labelled
 * gradient tiles, so the page is never broken.
 *
 * Asset filenames here are the single source of truth — the generator reads
 * this same list (via `lib/demo-manifest`) so the two never drift.
 */

export interface DemoLocation {
  id: string;
  name: string;
  /** Short city / neighbourhood line shown under the name. */
  address: string;
  /** Street-View-style backdrop thumbnail (landscape). */
  thumb: string;
  /** Folded into the assembled-prompt preview. */
  promptDescriptor: string;
}

export interface DemoModel {
  id: string;
  name: string;
  /** Round headshot. */
  avatar: string;
  promptDescriptor: string;
}

export interface DemoVariation {
  id: string;
  /** Colorway / styling label. */
  name: string;
  /** CSS color for the swatch dot. */
  swatch: string;
  /** Generated portrait for this look (3:4). */
  image: string;
  /** Optional pre-rendered i2v clip; missing clips fall back to a live CSS pan. */
  video?: string;
  promptDescriptor: string;
}

export interface DemoOutfit {
  id: string;
  name: string;
  promptDescriptor: string;
  variations: DemoVariation[];
}

export interface DemoImageModel {
  id: string;
  label: string;
  provider: string;
  /** USD per generated image, mirrored from the real registry. */
  price: number;
}

export interface DemoVideoModel {
  id: string;
  label: string;
  /** USD per second, mirrored from the real registry. */
  pricePerSecond: number;
}

export const DEMO_LOCATIONS: DemoLocation[] = [
  {
    id: "loc-tokyo",
    name: "Shibuya Crossing",
    address: "Tokyo, Japan",
    thumb: "/demo/loc-tokyo.jpg",
    promptDescriptor:
      "neon-lit Shibuya scramble crossing at dusk, glowing billboards, wet asphalt reflections",
  },
  {
    id: "loc-rome",
    name: "Trastevere Lane",
    address: "Rome, Italy",
    thumb: "/demo/loc-rome.jpg",
    promptDescriptor:
      "narrow cobblestone Trastevere alley, ochre walls, ivy and warm afternoon light",
  },
  {
    id: "loc-nyc",
    name: "SoHo Cast-Iron",
    address: "New York, USA",
    thumb: "/demo/loc-nyc.jpg",
    promptDescriptor:
      "SoHo cast-iron facades, fire escapes and cobblestones under soft overcast light",
  },
];

export const DEMO_MODELS: DemoModel[] = [
  {
    id: "model-maya",
    name: "Maya",
    avatar: "/demo/model-maya.jpg",
    promptDescriptor:
      "Maya, 27, warm brown skin, dark coiled hair, confident relaxed posture",
  },
  {
    id: "model-jonas",
    name: "Jonas",
    avatar: "/demo/model-jonas.jpg",
    promptDescriptor:
      "Jonas, 31, fair skin, light stubble, tousled sandy hair, easy stance",
  },
  {
    id: "model-aria",
    name: "Aria",
    avatar: "/demo/model-aria.jpg",
    promptDescriptor:
      "Aria, 24, East-Asian features, sleek black bob, poised editorial energy",
  },
];

export const DEMO_OUTFITS: DemoOutfit[] = [
  {
    id: "outfit-suit",
    name: "Tailored Linen Suit",
    promptDescriptor: "relaxed double-breasted linen suit, open collar, leather loafers",
    variations: [
      {
        id: "suit-sand",
        name: "Sand",
        swatch: "#cbb893",
        image: "/demo/suit-sand.jpg",
        video: "/demo/suit-sand.mp4",
        promptDescriptor: "sand-beige linen, tonal shirt",
      },
      {
        id: "suit-olive",
        name: "Olive",
        swatch: "#6b6f4b",
        image: "/demo/suit-olive.jpg",
        promptDescriptor: "muted olive linen, cream shirt",
      },
      {
        id: "suit-charcoal",
        name: "Charcoal",
        swatch: "#3b3b40",
        image: "/demo/suit-charcoal.jpg",
        promptDescriptor: "charcoal linen, slate shirt",
      },
    ],
  },
  {
    id: "outfit-denim",
    name: "Relaxed Denim Set",
    promptDescriptor: "oversized denim jacket and straight-leg jeans, white tee, sneakers",
    variations: [
      {
        id: "denim-indigo",
        name: "Indigo",
        swatch: "#33456b",
        image: "/demo/denim-indigo.jpg",
        video: "/demo/denim-indigo.mp4",
        promptDescriptor: "deep indigo raw denim",
      },
      {
        id: "denim-stonewash",
        name: "Stonewash",
        swatch: "#8ea2bd",
        image: "/demo/denim-stonewash.jpg",
        promptDescriptor: "light stonewash denim",
      },
      {
        id: "denim-black",
        name: "Washed Black",
        swatch: "#2a2a2d",
        image: "/demo/denim-black.jpg",
        promptDescriptor: "faded washed-black denim",
      },
    ],
  },
  {
    id: "outfit-trench",
    name: "Belted Trench",
    promptDescriptor: "long belted trench coat over knit and tailored trousers, ankle boots",
    variations: [
      {
        id: "trench-camel",
        name: "Camel",
        swatch: "#b58a55",
        image: "/demo/trench-camel.jpg",
        video: "/demo/trench-camel.mp4",
        promptDescriptor: "classic camel gabardine trench",
      },
      {
        id: "trench-cream",
        name: "Cream",
        swatch: "#e6dccb",
        image: "/demo/trench-cream.jpg",
        promptDescriptor: "soft cream trench",
      },
      {
        id: "trench-forest",
        name: "Forest",
        swatch: "#324b3a",
        image: "/demo/trench-forest.jpg",
        promptDescriptor: "deep forest-green trench",
      },
    ],
  },
];

/** Mirrors the real `imageModels.ts` registry (subset) — labels + prices. */
export const DEMO_IMAGE_MODELS: DemoImageModel[] = [
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    provider: "Google",
    price: 0.134,
  },
  {
    id: "fal-ai/nano-banana-2/edit",
    label: "Nano Banana 2 — via fal",
    provider: "fal",
    price: 0.08,
  },
  {
    id: "openai/gpt-image-2",
    label: "GPT Image 2",
    provider: "OpenAI",
    price: 0.25,
  },
  {
    id: "fal-ai/flux-pro/v1.1",
    label: "FLUX 1.1 Pro",
    provider: "fal",
    price: 0.04,
  },
];

export const DEMO_VIDEO_MODELS: DemoVideoModel[] = [
  {
    id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    label: "Kling 2.5 Turbo Pro",
    pricePerSecond: 0.07,
  },
  {
    id: "fal-ai/veo3/fast/image-to-video",
    label: "Veo 3 Fast",
    pricePerSecond: 0.15,
  },
];

export const DEMO_ASPECT_RATIOS = ["3:4", "4:5", "1:1", "9:16", "16:9"];

export function formatUsd(n: number): string {
  return n < 0.1 ? `${(n * 100).toFixed(1)}¢` : `$${n.toFixed(2)}`;
}
