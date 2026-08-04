/**
 * Telegram — the default way to talk to this agent.
 *
 * Free, unlike an iMessage line: a bot from @BotFather costs nothing, can start
 * conversations (so the daily suggestion works), and handles photos both ways.
 * The Sendblue channel next door is the same agent on iMessage for anyone who
 * wants blue bubbles enough to pay for a line.
 *
 * The chat id is the identity. `TELEGRAM_ALLOWED_CHAT_IDS` decides who the bot
 * will speak to at all — a bot username is discoverable, so without an
 * allowlist a stranger who finds it could spend your generation budget. Unset
 * means nobody, which is the safe default.
 */
import { telegramChannel } from "eve/channels/telegram";

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
};

function allowedChatIds(): string[] {
  return (env("TELEGRAM_ALLOWED_CHAT_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The principal Convex binds to a workspace — see convex/agent.ts. */
export const telegramPrincipal = (chatId: string | number): string =>
  `telegram:${chatId}`;

export default telegramChannel({
  botUsername: env("TELEGRAM_BOT_USERNAME"),
  uploadPolicy: {
    allowedMediaTypes: ["image/*"],
    maxBytes: 10 * 1024 * 1024,
  },
  onMessage: (_ctx, message) => {
    const chatId = String(message.chat?.id ?? "");
    if (!chatId || !allowedChatIds().includes(chatId)) return null;
    return {
      auth: {
        // This is what the tools carry to Convex as authorization, so it must
        // come from the verified webhook — never from anything the model wrote.
        principalId: telegramPrincipal(chatId),
        principalType: "user",
        authenticator: "telegram",
        attributes: { chatId },
      },
    };
  },
});
