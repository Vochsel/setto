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
    id: "openai/gpt-5",
    provider: "openai",
    label: "GPT-5",
    description: "Flagship — highest-quality, on-brand copywriting.",
    openaiModel: "gpt-5",
    pricePerCall: 0.02,
  },
  {
    id: "openai/gpt-5-mini",
    provider: "openai",
    label: "GPT-5 mini",
    description: "Fast and cheap — great for quick copy iterations.",
    openaiModel: "gpt-5-mini",
    pricePerCall: 0.004,
  },
  {
    id: "openai/gpt-5-chat",
    provider: "openai",
    label: "GPT-5 Chat",
    description: "Conversational tuning — punchy, creative lines.",
    openaiModel: "gpt-5-chat-latest",
    pricePerCall: 0.02,
  },
];

/**
 * The default text model. Overridable per-deployment with the OPENAI_TEXT_MODEL
 * env var — set the exact OpenAI model name (e.g. "gpt-5-mini"); if it isn't in
 * the registry above we still send it and fall back to this entry's pricing.
 */
export const DEFAULT_TEXT_MODEL_ID = "openai/gpt-5";

export function getTextModel(id: string): TextModel | undefined {
  return TEXT_MODELS.find((m) => m.id === id);
}

/** Estimated USD cost for one copy generation (0 if unknown). */
export function estimateTextCost(modelKey: string): number {
  return getTextModel(modelKey)?.pricePerCall ?? 0;
}
