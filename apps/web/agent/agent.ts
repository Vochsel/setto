import { defineAgent } from "eve";

/**
 * The setto iMessage agent.
 *
 * One number, one conversation, forever. Sessions are keyed on the texter's
 * phone number and never reset, so context accumulates the way it does with a
 * person you actually work with — it remembers that you hated the last set of
 * beach shots without being told again.
 *
 * That only works because compaction is on: at 70% of the window, older turns
 * are summarized rather than dropped. Lower than the 0.9 default deliberately —
 * a texting conversation runs for months, and the summary is cheaper to build
 * from a smaller tail.
 */
export default defineAgent({
  // Gateway id. eve would default to this anyway; naming it makes the choice
  // explicit and survives a change in eve's default.
  model: "anthropic/claude-sonnet-5",
  compaction: {
    thresholdPercent: 0.7,
  },
  limits: {
    // A texting session is long-lived by design, so cap the spend per session
    // rather than relying on it ending. Image generation is billed separately
    // (and capped in the tools themselves).
    maxOutputTokensPerSession: 2_000_000,
    // Effectively "never expire the thread" — a year.
    sessionTimeoutMs: 365 * 24 * 60 * 60 * 1000,
  },
});
