/**
 * Thin OpenAI helpers used by the campaign copy/research/ad-layout actions.
 * We deliberately stay on raw fetch (no SDK) to match the rest of the codebase
 * (see convex/generate.ts). Two entry points:
 *
 *   chatJSON           — Chat Completions, JSON object out (cheap, no web).
 *   responsesWebSearch — Responses API + the built-in `web_search` tool, so the
 *                        model can pull live market/competitor/trend info.
 *
 * Both honor the OPENAI_TEXT_MODEL env override (same as copy.ts did).
 */

const OPENAI_BASE = "https://api.openai.com/v1";

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) {
    throw new Error(
      "OPENAI_API_KEY is not set. Run: npx convex env set OPENAI_API_KEY <key>",
    );
  }
  return k;
}

/**
 * Tolerant JSON parse: models occasionally wrap JSON in ```fences``` or a line
 * of prose. Try strict first, then a fenced block, then the outermost braces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJsonObject(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("Model did not return valid JSON");
}

/**
 * POST a chat completion and return the message content. Newer reasoning-class
 * models only accept the default temperature; if the API rejects our value we
 * transparently retry once without it.
 */
async function postChat(body: Record<string, unknown>): Promise<string> {
  const send = (b: Record<string, unknown>) =>
    fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(b),
    });

  let res = await send(body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = await res.json();
  if (
    !res.ok &&
    res.status === 400 &&
    "temperature" in body &&
    /temperature/i.test(json?.error?.message ?? "")
  ) {
    const retry = { ...body };
    delete retry.temperature;
    res = await send(retry);
    json = await res.json();
  }
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `OpenAI error ${res.status}`);
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned an empty response");
  }
  return content;
}

/** Chat Completions with a JSON-object response. */
export async function chatJSON(opts: {
  model: string;
  system: string;
  user: string;
  /** Omitted for reasoning models that reject non-default temperature. */
  temperature?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any> {
  const body: Record<string, unknown> = {
    model: process.env.OPENAI_TEXT_MODEL ?? opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_object" },
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  return parseJsonObject(await postChat(body));
}

/** Chat Completions returning raw text (used for HTML layout generation). */
export async function chatText(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: process.env.OPENAI_TEXT_MODEL ?? opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  return postChat(body);
}

/**
 * Responses API with the built-in `web_search` tool. The prompt must ask for
 * JSON; we parse it tolerantly and also surface any cited source URLs found in
 * the output annotations. Returns `{ data, sources }`.
 */
export async function responsesWebSearch(opts: {
  model: string;
  instructions?: string;
  input: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<{ data: any; sources: string[] }> {
  const model = process.env.OPENAI_TEXT_MODEL ?? opts.model;
  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      input: opts.input,
      tools: [{ type: "web_search" }],
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `OpenAI error ${res.status}`);
  }

  // The final answer lives in the `output` array as a `message` with one or
  // more `output_text` parts; url citations are in each part's annotations.
  const output = Array.isArray(json.output) ? json.output : [];
  const parts: string[] = [];
  const sources = new Set<string>();
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c?.type === "output_text" && typeof c.text === "string") {
        parts.push(c.text);
        const anns = Array.isArray(c.annotations) ? c.annotations : [];
        for (const a of anns) {
          const url = a?.url ?? a?.url_citation?.url;
          if (typeof url === "string") sources.add(url);
        }
      }
    }
  }
  let text = parts.join("");
  if (!text && typeof json.output_text === "string") text = json.output_text;
  if (!text) throw new Error("OpenAI returned an empty response");

  return { data: parseJsonObject(text), sources: Array.from(sources) };
}
