/**
 * Prompt assembly. Pure module (no Convex runtime deps) so it can be imported by
 * both the generation action and the client-side prompt preview.
 *
 * Turns a shot + its resolved entities (model, outfit/variation, location,
 * style/camera/lighting presets, schedule) into a single well-structured prompt
 * plus the reference image URLs to use for image-conditioned models.
 */

export interface PromptEntity {
  name?: string;
  promptDescriptor?: string;
}

export interface PromptModel extends PromptEntity {
  attributes?: Record<string, unknown> | null;
}

export interface PromptLocation extends PromptEntity {
  address?: string;
  streetViewUrls?: string[];
}

export interface CameraFraming {
  shotType?: string; // "wide" | "medium" | "close-up" | ...
  angleLabel?: string; // "eye-level" | "low angle" | "high angle" | "top-down"
  heightM?: number;
  distanceM?: number;
  fov?: number;
  lensMm?: number;
}

export interface PromptShot {
  name?: string;
  posePrompt?: string;
  extraPrompt?: string;
  cameraFraming?: CameraFraming | null;
}

export interface PromptInputs {
  shot: PromptShot;
  model?: PromptModel | null;
  outfit?: PromptEntity | null;
  variation?: PromptEntity | null;
  location?: PromptLocation | null;
  style?: PromptEntity | null;
  camera?: PromptEntity | null;
  lighting?: PromptEntity | null;
  scheduledAt?: number | null;
  timezone?: string | null;
}

export interface AssembledPrompt {
  prompt: string;
  negativePrompt: string;
  referenceImageUrls: string[];
  sections: { label: string; text: string }[];
}

function timeOfDay(hour: number): string {
  if (hour < 5) return "pre-dawn night, deep blue ambient light";
  if (hour < 7) return "dawn, soft warm sunrise light";
  if (hour < 10) return "early morning, crisp directional light";
  if (hour < 15) return "midday, bright natural daylight";
  if (hour < 18) return "late afternoon, warm golden-hour light";
  if (hour < 20) return "dusk, soft fading light with long shadows";
  return "night, artificial and ambient city light";
}

function describeFraming(f: CameraFraming): string {
  const parts: string[] = [];
  if (f.shotType) parts.push(`${f.shotType} shot`);
  if (f.angleLabel) parts.push(f.angleLabel);
  if (f.lensMm) parts.push(`${f.lensMm}mm lens`);
  else if (f.fov) parts.push(`${Math.round(f.fov)}° field of view`);
  if (typeof f.distanceM === "number")
    parts.push(`subject ~${f.distanceM.toFixed(1)}m from camera`);
  if (typeof f.heightM === "number")
    parts.push(`camera at ~${f.heightM.toFixed(1)}m height`);
  return parts.join(", ");
}

const DEFAULT_NEGATIVE =
  "lowres, blurry, deformed hands, extra fingers, extra limbs, mutated, " +
  "disfigured, bad anatomy, watermark, text, logo, jpeg artifacts, " +
  "oversaturated, plastic skin, cartoon, illustration";

export function buildPrompt(inputs: PromptInputs): AssembledPrompt {
  const sections: { label: string; text: string }[] = [];
  const push = (label: string, text?: string | null) => {
    const t = (text ?? "").trim();
    if (t) sections.push({ label, text: t });
  };

  // 1. Subject
  if (inputs.model) {
    const attrs = inputs.model.attributes
      ? Object.entries(inputs.model.attributes)
          .filter(([, val]) => val != null && val !== "")
          .map(([k, val]) => `${k}: ${val}`)
          .join(", ")
      : "";
    push(
      "Subject",
      inputs.model.promptDescriptor ||
        [inputs.model.name, attrs].filter(Boolean).join(" — "),
    );
  }

  // 2. Wardrobe
  const wardrobe = [
    inputs.outfit?.promptDescriptor || inputs.outfit?.name,
    inputs.variation?.promptDescriptor || inputs.variation?.name,
  ]
    .filter(Boolean)
    .join(", ");
  push("Wardrobe", wardrobe);

  // 3. Pose / action
  push("Pose", inputs.shot.posePrompt);

  // 4. Setting — grounded on the real place
  if (inputs.location) {
    const loc = [
      inputs.location.promptDescriptor || inputs.location.name,
      inputs.location.address ? `(${inputs.location.address})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const grounding = inputs.location.streetViewUrls?.length
      ? " Use the provided reference photos of this exact location as a guide for the architecture, materials, and surroundings, then compose a fresh, intentional, editorial photograph in that place."
      : "";
    push("Setting", `${loc}.${grounding}`);
  }

  // 5. Time of day from the shoot schedule — actual 12-hour clock time with
  // am/pm (in the shoot's timezone when known) plus a light description.
  if (inputs.scheduledAt) {
    const d = new Date(inputs.scheduledAt);
    const tz = inputs.timezone ?? undefined;
    let timeStr: string;
    let hour: number;
    try {
      timeStr = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      }).format(d);
      hour = parseInt(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone: tz,
        }).format(d),
        10,
      );
    } catch {
      timeStr = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      hour = d.getHours();
    }
    push("Time of day", `${timeStr} — ${timeOfDay(hour)}`);
  }

  // 6. Lighting preset
  push("Lighting (setup)", inputs.lighting?.promptDescriptor || inputs.lighting?.name);

  // 7. Photography style
  push("Style", inputs.style?.promptDescriptor || inputs.style?.name);

  // 8. Camera
  const cameraText = [
    inputs.camera?.promptDescriptor || inputs.camera?.name,
    inputs.shot.cameraFraming ? describeFraming(inputs.shot.cameraFraming) : "",
  ]
    .filter(Boolean)
    .join(", ");
  push("Camera", cameraText);

  // 9. Freeform extras
  push("Extra direction", inputs.shot.extraPrompt);

  // 10. Quality baseline
  push(
    "Quality",
    "photorealistic, ultra-detailed, professional fashion editorial photography, " +
      "natural skin texture, sharp focus on subject, cinematic color grading, " +
      "high dynamic range",
  );

  const prompt = sections.map((s) => `${s.label}: ${s.text}`).join("\n");

  return {
    prompt,
    negativePrompt: DEFAULT_NEGATIVE,
    referenceImageUrls: inputs.location?.streetViewUrls ?? [],
    sections,
  };
}

/* ───────────────────────── Campaign ad creatives ─────────────────────────
 * A campaign creative composes a finished advertisement: it takes the chosen
 * shoot photos as the hero imagery, follows the look/layout of the uploaded
 * inspiration ad designs, and lays the campaign copy over the top. Kept here as
 * a pure function so the client can preview the exact prompt the action sends.
 */

export interface CreativeCopy {
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

export interface CreativePromptInputs {
  campaignName?: string;
  brief?: string | null;
  copy?: CreativeCopy | null;
  aspectRatio?: string | null;
  /** How many hero shots are attached as references (for guidance wording). */
  shotCount?: number;
  /** How many inspiration designs are attached (for guidance wording). */
  inspirationCount?: number;
}

const ASPECT_GUIDE: Record<string, string> = {
  "1:1": "square 1:1 format (feed / general)",
  "4:5": "vertical 4:5 portrait format (Instagram feed)",
  "9:16": "tall 9:16 vertical format (story / reel)",
  "16:9": "wide 16:9 landscape format (banner / web)",
};

export function buildCreativePrompt(inputs: CreativePromptInputs): {
  prompt: string;
  sections: { label: string; text: string }[];
} {
  const sections: { label: string; text: string }[] = [];
  const push = (label: string, text?: string | null) => {
    const t = (text ?? "").trim();
    if (t) sections.push({ label, text: t });
  };

  push(
    "Task",
    "Design a polished, professional advertising creative — a single finished " +
      "marketing image ready to publish.",
  );
  push("Campaign", inputs.campaignName);
  push("Brief", inputs.brief);

  const ratio = inputs.aspectRatio ?? undefined;
  push(
    "Format",
    ratio ? (ASPECT_GUIDE[ratio] ?? `${ratio} format`) : "social-ad format",
  );

  // The words that must appear on the creative, rendered as crisp typography.
  if (inputs.copy) {
    const c = inputs.copy;
    const lines: string[] = [];
    if (c.headline) lines.push(`Headline (large, primary): "${c.headline}"`);
    if (c.tagline) lines.push(`Tagline (supporting): "${c.tagline}"`);
    if (c.body) lines.push(`Body copy (small): "${c.body}"`);
    if (c.cta) lines.push(`Call-to-action button text: "${c.cta}"`);
    if (lines.length) {
      push(
        "Copy to render",
        "Lay out this exact text as clean, legible, correctly-spelled " +
          "typography integrated into the design:\n" +
          lines.join("\n"),
      );
    }
  }

  if (inputs.shotCount && inputs.shotCount > 0) {
    push(
      "Hero imagery",
      `Use the ${inputs.shotCount} attached product/model photo${
        inputs.shotCount === 1 ? "" : "s"
      } as the hero subject of the ad. Feature them prominently and keep them ` +
        "photorealistic and unaltered in likeness.",
    );
  }
  if (inputs.inspirationCount && inputs.inspirationCount > 0) {
    push(
      "Style reference",
      `Follow the composition, layout, colour palette and typographic style of ` +
        `the ${inputs.inspirationCount} attached inspiration ad design${
          inputs.inspirationCount === 1 ? "" : "s"
        } — match the vibe, but create an original layout (do not copy them).`,
    );
  }

  push(
    "Quality",
    "high-end art direction, balanced composition, intentional negative space " +
      "for the text, sharp focus, professional commercial photography and " +
      "graphic design, no spelling mistakes, no gibberish text, no watermark.",
  );

  const prompt = sections.map((s) => `${s.label}: ${s.text}`).join("\n\n");
  return { prompt, sections };
}
