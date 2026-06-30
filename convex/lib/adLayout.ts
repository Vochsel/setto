/**
 * Prompt + parsing helpers for the HTML/Tailwind ad composer. The model emits a
 * single self-contained HTML fragment styled with Tailwind classes, using
 * `{{slot:ID}}` placeholders wherever media should appear. We then parse the
 * slot ids and lightly sanitize the markup (it's rendered in an opaque-origin
 * sandboxed iframe, so this is defense-in-depth, not the only line of defense).
 */

export interface LayoutCopy {
  headline?: string;
  tagline?: string;
  body?: string;
  cta?: string;
}

const ASPECT_GUIDE: Record<string, string> = {
  "1:1": "square 1:1 (feed)",
  "4:5": "vertical 4:5 portrait (Instagram feed)",
  "9:16": "tall 9:16 vertical (story / reel)",
  "16:9": "wide 16:9 landscape (banner / web)",
};

export const LAYOUT_SYSTEM =
  "You are an expert advertising art director who writes production HTML. " +
  "You output a SINGLE self-contained HTML fragment for one social-ad creative, " +
  "styled entirely with Tailwind CSS utility classes.\n\n" +
  "Hard rules:\n" +
  "- Output ONLY the HTML for one root <div>. No <html>/<head>/<body>, no " +
  "markdown fences, no comments, no <style>, no <script>.\n" +
  "- The root <div> must be `relative` and fill its parent: `w-full h-full`. " +
  "The parent enforces the aspect ratio.\n" +
  "- Place all imagery using EXACT placeholder tokens of the form {{slot:id}} " +
  "(lowercase id, e.g. {{slot:background}}, {{slot:hero}}). Each token is " +
  "replaced by an image or video that fills its immediate parent with " +
  "object-cover, so wrap every token in a sized, positioned container, e.g. " +
  '`<div class="absolute inset-0">{{slot:background}}</div>`.\n' +
  "- Use 1 to 3 slots. A full-bleed {{slot:background}} behind the copy is a " +
  "great default.\n" +
  "- Render the provided copy as REAL text with strong hierarchy: a prominent " +
  "headline, optional tagline, optional body, and — if a CTA is provided — a " +
  "clearly styled call-to-action button containing that exact text. Use " +
  "overlays/gradients for legible contrast and generous padding.\n" +
  "- Do not invent copy beyond what is provided (omit empty fields). No " +
  "external images, fonts, or links.";

export function buildLayoutUser(opts: {
  copy: LayoutCopy;
  aspectRatio?: string | null;
  shotCount: number;
  instructions?: string;
}): string {
  const ratio = opts.aspectRatio ?? undefined;
  const format = ratio ? (ASPECT_GUIDE[ratio] ?? `${ratio} format`) : "social-ad format";
  const c = opts.copy;
  const copyLines = [
    c.headline ? `- Headline: "${c.headline}"` : null,
    c.tagline ? `- Tagline: "${c.tagline}"` : null,
    c.body ? `- Body: "${c.body}"` : null,
    c.cta ? `- CTA button: "${c.cta}"` : null,
  ].filter(Boolean);

  return (
    `Design a ${format} ad.\n\n` +
    (copyLines.length
      ? `Copy to lay out (use exactly, omit any that are blank):\n${copyLines.join("\n")}\n\n`
      : "No copy provided — design a clean layout with a prominent empty headline area.\n\n") +
    (opts.shotCount > 0
      ? `Imagery: design around a full-bleed photo background ({{slot:background}}); ` +
        `you may add one more slot if it strengthens the layout.\n`
      : `Imagery: include a full-bleed {{slot:background}} slot for a photo.\n`) +
    (opts.instructions ? `\nExtra art direction: ${opts.instructions}\n` : "")
  );
}

/** Unique slot ids in first-appearance order. */
export function parseSlots(html: string): string[] {
  const ids: string[] = [];
  const re = /\{\{\s*slot:([a-zA-Z0-9_-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Strip fences, scripts, inline handlers and javascript: urls. */
export function sanitizeHtml(input: string): string {
  let html = input.trim();
  const fence = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) html = fence[1].trim();
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
  return html.trim();
}
