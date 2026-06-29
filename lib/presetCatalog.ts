/**
 * A curated library of presets users can add to their workspace and remove at
 * will. Pure data (client-side) — adding just calls `presets.create`.
 */
export type PresetType = "photography_style" | "camera_setup" | "lighting";

export interface CatalogPreset {
  type: PresetType;
  name: string;
  description: string;
  promptDescriptor: string;
}

export const PRESET_CATALOG: CatalogPreset[] = [
  // ── Photography styles ────────────────────────────────────────────
  {
    type: "photography_style",
    name: "Editorial Fashion",
    description: "High-fashion magazine look",
    promptDescriptor:
      "high-fashion editorial photography, Vogue style, bold confident styling, refined color grading, shallow depth of field",
  },
  {
    type: "photography_style",
    name: "Street Documentary",
    description: "Candid, grounded, real",
    promptDescriptor:
      "candid street-style documentary photography, natural moment, authentic grain, true-to-life color",
  },
  {
    type: "photography_style",
    name: "Cinematic",
    description: "Film-still mood",
    promptDescriptor:
      "cinematic film still, anamorphic look, moody color grade, dramatic atmosphere, 35mm film texture",
  },
  {
    type: "photography_style",
    name: "High-Key Beauty",
    description: "Bright, clean, glossy",
    promptDescriptor:
      "high-key beauty photography, bright airy exposure, flawless clean skin, glossy commercial finish, minimal shadows",
  },
  {
    type: "photography_style",
    name: "Film Noir",
    description: "Moody high-contrast B&W",
    promptDescriptor:
      "black-and-white film noir, deep shadows, hard contrast, dramatic chiaroscuro, vintage grain",
  },
  {
    type: "photography_style",
    name: "Vintage 70s Film",
    description: "Warm retro analog",
    promptDescriptor:
      "1970s vintage film aesthetic, warm faded tones, soft halation, visible grain, nostalgic color cast",
  },
  {
    type: "photography_style",
    name: "Y2K Flash",
    description: "Direct-flash party look",
    promptDescriptor:
      "early-2000s direct on-camera flash, harsh shadows, slightly blown highlights, candid snapshot energy",
  },
  {
    type: "photography_style",
    name: "Minimalist Studio",
    description: "Clean seamless backdrop",
    promptDescriptor:
      "minimalist studio photography, seamless solid backdrop, controlled even light, modern clean composition",
  },
  {
    type: "photography_style",
    name: "Sun-drenched Lifestyle",
    description: "Bright candid lifestyle",
    promptDescriptor:
      "sun-drenched lifestyle photography, natural light, warm golden tones, relaxed candid feel, lens flare",
  },
  {
    type: "photography_style",
    name: "Analog Grain",
    description: "35mm film texture",
    promptDescriptor:
      "shot on 35mm film, organic grain, natural color science, subtle imperfections, photochemical look",
  },
  {
    type: "photography_style",
    name: "Glossy Commercial",
    description: "Polished advertising",
    promptDescriptor:
      "glossy commercial advertising photography, immaculate retouching, vibrant saturated color, crisp detail",
  },
  {
    type: "photography_style",
    name: "Fine-Art B&W",
    description: "Timeless monochrome",
    promptDescriptor:
      "fine-art black-and-white photography, rich tonal range, elegant contrast, timeless monochrome",
  },
  {
    type: "photography_style",
    name: "Pastel Dream",
    description: "Soft dreamy palette",
    promptDescriptor:
      "soft pastel color palette, dreamy diffused glow, gentle low contrast, ethereal romantic mood",
  },
  {
    type: "photography_style",
    name: "Gritty Urban",
    description: "Raw city edge",
    promptDescriptor:
      "gritty urban photography, desaturated tones, raw texture, high clarity, edgy street atmosphere",
  },

  // ── Camera setups ─────────────────────────────────────────────────
  {
    type: "camera_setup",
    name: "85mm Portrait",
    description: "Classic flattering portrait",
    promptDescriptor:
      "shot on a full-frame camera with an 85mm f/1.4 lens, creamy bokeh, eye-level, tight headroom",
  },
  {
    type: "camera_setup",
    name: "35mm Environmental",
    description: "Subject in context",
    promptDescriptor:
      "shot on a 35mm f/2 lens, environmental framing showing the location, slight wide perspective",
  },
  {
    type: "camera_setup",
    name: "24mm Wide",
    description: "Dramatic, expansive",
    promptDescriptor:
      "shot on a 24mm wide-angle lens, low angle, dramatic perspective emphasizing the surroundings",
  },
  {
    type: "camera_setup",
    name: "50mm Standard",
    description: "Natural human-eye view",
    promptDescriptor:
      "shot on a 50mm f/1.8 lens, natural perspective, balanced framing, gentle background separation",
  },
  {
    type: "camera_setup",
    name: "135mm Telephoto",
    description: "Compressed & intimate",
    promptDescriptor:
      "shot on a 135mm f/2 telephoto lens, strong background compression, tight intimate framing, smooth bokeh",
  },
  {
    type: "camera_setup",
    name: "Macro Detail",
    description: "Close-up texture",
    promptDescriptor:
      "macro photography, extreme close-up on fabric and accessory detail, razor-thin depth of field",
  },
  {
    type: "camera_setup",
    name: "Low-Angle Hero",
    description: "Powerful, towering",
    promptDescriptor:
      "low camera angle looking up at the subject, heroic powerful stance, dynamic upward perspective",
  },
  {
    type: "camera_setup",
    name: "Top-Down Flatlay",
    description: "Overhead styling",
    promptDescriptor:
      "top-down overhead shot, flat-lay composition, items arranged neatly, even directional light",
  },
  {
    type: "camera_setup",
    name: "Dutch Angle",
    description: "Tilted, energetic",
    promptDescriptor:
      "dutch tilted camera angle, off-kilter dynamic composition, editorial energy",
  },
  {
    type: "camera_setup",
    name: "Full-Length Wide",
    description: "Head-to-toe look",
    promptDescriptor:
      "full-length head-to-toe framing, subject centered, showing the complete outfit and footwear",
  },
  {
    type: "camera_setup",
    name: "Tight Headshot",
    description: "Beauty crop",
    promptDescriptor:
      "tight beauty headshot crop, focus on face and expression, shallow depth of field",
  },
  {
    type: "camera_setup",
    name: "Aerial / Drone",
    description: "Bird's-eye view",
    promptDescriptor:
      "high aerial drone perspective, bird's-eye view of subject within the environment, expansive scale",
  },

  // ── Lighting ──────────────────────────────────────────────────────
  {
    type: "lighting",
    name: "Golden Hour",
    description: "Warm natural sun",
    promptDescriptor:
      "warm golden-hour sunlight, long soft shadows, glowing rim light",
  },
  {
    type: "lighting",
    name: "Softbox Studio",
    description: "Clean key + fill",
    promptDescriptor:
      "studio softbox lighting, soft key light with gentle fill, controlled even exposure",
  },
  {
    type: "lighting",
    name: "Overcast Diffused",
    description: "Flat, flattering",
    promptDescriptor:
      "soft overcast diffused daylight, even flattering light, no harsh shadows",
  },
  {
    type: "lighting",
    name: "Hard Noon Sun",
    description: "Crisp, punchy shadows",
    promptDescriptor:
      "hard direct midday sun, crisp defined shadows, high contrast, punchy highlights",
  },
  {
    type: "lighting",
    name: "Rembrandt",
    description: "Classic portrait key",
    promptDescriptor:
      "Rembrandt lighting, single key at 45 degrees, characteristic cheek triangle, sculpted shadows",
  },
  {
    type: "lighting",
    name: "Butterfly Beauty",
    description: "Glamour front light",
    promptDescriptor:
      "butterfly/paramount beauty lighting, frontal elevated key, soft symmetrical shadow under the nose, glamorous",
  },
  {
    type: "lighting",
    name: "Backlit Rim",
    description: "Glowing separation",
    promptDescriptor:
      "strong backlight with rim glow separating subject from background, hazy atmosphere",
  },
  {
    type: "lighting",
    name: "Neon Night",
    description: "Colorful city glow",
    promptDescriptor:
      "neon nighttime lighting, saturated magenta and cyan glow, reflective wet surfaces, cinematic city mood",
  },
  {
    type: "lighting",
    name: "Window Light",
    description: "Soft natural indoor",
    promptDescriptor:
      "soft natural window light from the side, gentle falloff, intimate indoor mood",
  },
  {
    type: "lighting",
    name: "Blue Hour",
    description: "Cool twilight",
    promptDescriptor:
      "blue-hour twilight, cool ambient tones, soft fading light, calm atmospheric mood",
  },
  {
    type: "lighting",
    name: "Ring Light",
    description: "Even beauty fill",
    promptDescriptor:
      "ring-light illumination, even frontal fill, catchlight rings in the eyes, contemporary beauty look",
  },
  {
    type: "lighting",
    name: "Dramatic Single Source",
    description: "Moody spotlight",
    promptDescriptor:
      "single dramatic light source, deep falloff into shadow, moody spotlight, high contrast",
  },
  {
    type: "lighting",
    name: "High-Key White",
    description: "Bright shadowless",
    promptDescriptor:
      "high-key lighting on a white background, bright and nearly shadowless, clean commercial look",
  },
];
