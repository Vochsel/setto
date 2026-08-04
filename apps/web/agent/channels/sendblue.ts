/**
 * Sendblue — the iMessage line.
 *
 * Inbound texts arrive on `POST /eve/v1/sendblue/webhook`; replies go back out
 * through Sendblue's send-message API. The continuation token is the texter's
 * phone number and nothing else, which is what makes this one endless
 * conversation per person rather than a thread per message — eve resumes the
 * same durable session every time, and compaction (see agent.ts) keeps it
 * inside the context window indefinitely.
 *
 * Two things gate access, and both matter because a phone number is the only
 * identity here:
 *   - the shared webhook secret proves the request came from Sendblue;
 *   - `SENDBLUE_ALLOWED_NUMBERS` decides who the agent will talk to at all.
 *     Without it a wrong number reaches your catalogue.
 *
 * Sendblue's free sandbox tier is inbound-first on a shared number: replies to
 * an inbound message work, but agent-initiated sends (the daily suggestion)
 * need a paid line. The code path is the same either way — outbound just fails
 * with Sendblue's own error until the line is upgraded.
 */
import { defineChannel, POST } from "eve/channels";

const SEND_ENDPOINT = "https://api.sendblue.co/api/send-message";

/** iMessage has no hard limit like SMS, but a wall of text reads badly. */
const MAX_CHARS = 1400;

interface InboundPayload {
  content?: string;
  media_url?: string;
  from_number?: string;
  number?: string;
  to_number?: string;
  is_outbound?: boolean;
  message_handle?: string;
  message_type?: string;
  group_id?: string;
}

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
};

/** Bare digits with a leading + — Sendblue and our bindings must agree. */
function normalize(phone: string): string {
  return `+${phone.replace(/[^\d]/g, "")}`;
}

/**
 * Who may talk to the agent. A comma-separated allowlist; unset means nobody,
 * which is the safe default for a number that can spend money.
 */
function isAllowed(phone: string): boolean {
  const raw = env("SENDBLUE_ALLOWED_NUMBERS");
  if (!raw) return false;
  return raw
    .split(",")
    .map((n) => normalize(n))
    .includes(normalize(phone));
}

/**
 * Sendblue puts the configured secret in the request headers but doesn't
 * document which one, so accept the plausible spellings rather than guessing a
 * single name. When no secret is configured we fall through to the allowlist
 * alone — noted rather than silently permitted.
 */
function webhookAuthorized(req: Request): boolean {
  const expected = env("SENDBLUE_WEBHOOK_SECRET");
  if (!expected) return true;
  const candidates = [
    "sb-signing-secret",
    "sb-webhook-secret",
    "x-sendblue-secret",
    "x-webhook-secret",
    "authorization",
  ];
  for (const header of candidates) {
    const value = req.headers.get(header);
    if (!value) continue;
    if (value === expected || value === `Bearer ${expected}`) return true;
  }
  return false;
}

/** Split a reply into iMessage-sized chunks on sentence boundaries. */
function chunk(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return trimmed ? [trimmed] : [];
  const out: string[] = [];
  let rest = trimmed;
  while (rest.length > MAX_CHARS) {
    const window = rest.slice(0, MAX_CHARS);
    const cut = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf(" "),
    );
    const at = cut > MAX_CHARS * 0.5 ? cut + 1 : MAX_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

/**
 * Image URLs the agent mentions are worth sending as actual attachments — an
 * iMessage with the photo in it is the whole point. Pulled out of the reply
 * text and sent as media, one message each.
 */
function extractImageUrls(text: string): string[] {
  const matches = text.match(/https:\/\/\S+\.(?:png|jpe?g|webp|heic)(?=[\s)]|$)/gi);
  return [...new Set(matches ?? [])].slice(0, 4);
}

async function sendToSendblue(args: {
  to: string;
  content?: string;
  mediaUrl?: string;
}): Promise<void> {
  const apiKey = env("SENDBLUE_API_KEY_ID");
  const apiSecret = env("SENDBLUE_API_SECRET_KEY");
  if (!apiKey || !apiSecret) {
    throw new Error(
      "SENDBLUE_API_KEY_ID / SENDBLUE_API_SECRET_KEY are not set — cannot reply.",
    );
  }
  const body: Record<string, unknown> = { number: args.to };
  const from = env("SENDBLUE_FROM_NUMBER");
  if (from) body.from_number = from;
  if (args.content) body.content = args.content;
  if (args.mediaUrl) body.media_url = args.mediaUrl;

  const res = await fetch(SEND_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sb-api-key-id": apiKey,
      "sb-api-secret-key": apiSecret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Sendblue send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

export default defineChannel({
  routes: [
    POST("/webhook", async (req, { send, waitUntil }) => {
      if (!webhookAuthorized(req)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let payload: InboundPayload;
      try {
        payload = (await req.json()) as InboundPayload;
      } catch {
        return new Response("Bad request", { status: 400 });
      }

      // Sendblue posts our own outbound messages back on the same hook; acting
      // on those would have the agent answering itself forever.
      if (payload.is_outbound) return new Response("ok");

      const from = payload.from_number ?? payload.number;
      if (!from) return new Response("ok");
      const phone = normalize(from);

      if (!isAllowed(phone)) {
        // Acknowledge so Sendblue stops retrying, but don't engage.
        return new Response("ok");
      }

      const text = (payload.content ?? "").trim();
      const media = payload.media_url;
      if (!text && !media) return new Response("ok");

      // The phone number is both the thread key and the authorization the tools
      // carry to Convex — it must come from here, never from the model.
      const auth = {
        principalId: phone,
        principalType: "user" as const,
        authenticator: "sendblue",
        attributes: { line: payload.to_number ?? payload.number ?? "" },
      };

      const message = media
        ? [
            { type: "text" as const, text: text || "(sent a photo)" },
            { type: "file" as const, data: new URL(media), mediaType: "image/jpeg" },
          ]
        : text;

      waitUntil(
        send(message, { auth, continuationToken: phone }).catch(
          async (error: unknown) => {
            await sendToSendblue({
              to: phone,
              content: `Something broke on my side: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }).catch(() => {});
          },
        ),
      );

      // Sendblue needs a 200 promptly; the turn continues in the background.
      return new Response("ok");
    }),
  ],

  events: {
    async "message.completed"(eventData, _channel, ctx) {
      // Tool-call steps aren't replies — only deliver finished prose.
      if (eventData.finishReason === "tool-calls") return;
      const text = eventData.message;
      if (!text) return;

      // The initiator is the texter — the same value used as the continuation
      // token, so a reply always goes back to the thread that asked.
      const to = ctx.session?.auth?.initiator?.principalId;
      if (!to) return;

      const images = extractImageUrls(text);
      // Strip the URLs from the prose — the picture is arriving as an
      // attachment, and a raw URL in an iMessage looks like a mistake.
      let prose = text;
      for (const url of images) prose = prose.split(url).join("");
      prose = prose.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

      for (const part of chunk(prose)) {
        await sendToSendblue({ to, content: part });
      }
      for (const url of images) {
        await sendToSendblue({ to, mediaUrl: url });
      }
    },
  },
});
