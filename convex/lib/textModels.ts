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
    id: "openai/gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    description: "Balanced, high-quality copywriting with strong instruction following.",
    openaiModel: "gpt-4o",
    pricePerCall: 0.01,
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    description: "Fast and cheap — great for quick copy iterations.",
    openaiModel: "gpt-4o-mini",
    pricePerCall: 0.002,
  },
  {
    id: "openai/gpt-4.1",
    provider: "openai",
    label: "GPT-4.1",
    description: "Sharper long-form reasoning for nuanced brand voice.",
    openaiModel: "gpt-4.1",
    pricePerCall: 0.012,
  },
];

/**
 * The default text model. Overridable per-deployment with the OPENAI_TEXT_MODEL
 * env var (set the provider model name, e.g. "gpt-5", and we'll match or fall
 * back to a synthetic registry entry).
 */
export const DEFAULT_TEXT_MODEL_ID = "openai/gpt-4o";

export function getTextModel(id: string): TextModel | undefined {
  return TEXT_MODELS.find((m) => m.id === id);
}

/** Estimated USD cost for one copy generation (0 if unknown). */
export function estimateTextCost(modelKey: string): number {
  return getTextModel(modelKey)?.pricePerCall ?? 0;
}
