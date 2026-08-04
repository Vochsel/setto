/**
 * The daily nudge: "here's what I'd shoot today".
 *
 * Runs on Vercel Cron (eve turns every `defineSchedule` into one at build time)
 * and hands the work to whichever messaging channel is configured, so the
 * suggestion lands in the same thread as everything else — same session, same
 * memory, so it can say "the tee you liked last week" and mean it.
 *
 * Telegram is the default because a bot can start a conversation for free.
 * Sendblue's free sandbox is inbound-first, so on iMessage this only works once
 * the line is paid for; the send simply fails until then, logged rather than
 * silently swallowed.
 *
 * 22:30 UTC is ~08:30 in Sydney. Vercel evaluates cron in UTC, so the offset is
 * baked in here rather than left to a timezone lookup at fire time.
 */
import { defineSchedule } from "eve/schedules";

import telegram from "../channels/telegram";
import sendblue from "../channels/sendblue";

const PROMPT = `It's the daily check-in. Do this without asking me anything first:

1. Call sync_shopify to pull anything new from the store.
2. Call list_products { onlyUnshot: true } to see what has no photos.
3. If nothing needs shooting, send ONE short message saying the catalogue is
   covered, and stop. Don't invent work.
4. Otherwise pick the two or three products most worth shooting today — newest
   arrivals first, then anything that's been sitting unshot — and send ONE short
   message naming them and what you'd shoot for each (which person, which
   location, roughly what it'd cost).
5. Stop there and wait. Do not generate anything until I reply.`;

const first = (value?: string): string | undefined =>
  value?.split(",")[0]?.trim() || undefined;

export default defineSchedule({
  cron: "30 22 * * *",
  async run({ receive, waitUntil, appAuth }) {
    const chatId = first(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
    if (chatId) {
      waitUntil(
        receive(telegram, {
          message: PROMPT,
          target: { chatId },
          auth: appAuth,
        }),
      );
      return;
    }

    const phoneNumber = first(process.env.SENDBLUE_ALLOWED_NUMBERS);
    if (!phoneNumber) return; // nobody configured to text
    waitUntil(
      receive(sendblue, {
        message: PROMPT,
        target: { phoneNumber },
        auth: appAuth,
      }),
    );
  },
});
