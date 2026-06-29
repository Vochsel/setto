/**
 * Registry of text (LLM) models used for writing ad copy. Mirrors the shape of
 * `imageModels.ts`: the `id` is stored on the usage event (modelKey) and shown
 * in the picker. Only OpenAI (GPT) is wired up today.
 */

export type TextProvider = "openai";

export interface TextModel {
  id: string;
  provider: TextProvider;
  label: string;
  description: string;
  /** The model name sent to the provider API. */
  openaiModel: string;
  /** Rough USD cost for one copy generation, for usage tracking. */
  pricePerCall: number;
}

export const TEXT_MODELS: TextModel[] = [
  {
    id: "openai/gpt-5.5",
    provider: "openai",
    label: "GPT-5.5",
    description: "Flagship — balanced, high-quality copywriting with strong instruction following.",
    openaiModel: "gpt-5.5",
    pricePerCall: 0.02,
  },
  {
    id: "openai/gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    description: "Fast and cheap — great for quick copy iterations.",
    openaiModel: "gpt-5.4-mini",
    pricePerCall: 0.003,
  },
  {
    id: "openai/gpt-5.4",
    provider: "openai",
    label: "GPT-5.4",
    description: "More affordable — strong reasoning for nuanced brand voice.",
    openaiModel: "gpt-5.4",
    pricePerCall: 0.012,
  },
];

/**
 * The default text model. Overridable per-deployment with the OPENAI_TEXT_MODEL
 * env var (set the provider model name, e.g. "gpt-5.6", and we'll match or fall
 * back to a synthetic registry entry). Note GPT-5.6 is currently preview-only to
 * select partners, so it's not in the picker above — opt in via the env var.
 */
export const DEFAULT_TEXT_MODEL_ID = "openai/gpt-5.5";

export function getTextModel(id: string): TextModel | undefined {
  return TEXT_MODELS.find((m) => m.id === id);
}

/** Estimated USD cost for one copy generation (0 if unknown). */
export function estimateTextCost(modelKey: string): number {
  return getTextModel(modelKey)?.pricePerCall ?? 0;
}
