import type { ModelChoice } from "./model-choice";
import type { ProviderState } from "./types";
import { isRecord, knownValues } from "./values";

// What a model's endpoint refused once, so later requests leave it out from
// the start instead of failing the same way first: image content,
// mid-conversation tool declarations, the quick-task thinking fields.
export const MODEL_REFUSAL = {
  images: "images",
  inlineTools: "inlineTools",
  quickThinking: "quickThinking",
} as const;

export type ModelRefusal = (typeof MODEL_REFUSAL)[keyof typeof MODEL_REFUSAL];

const REFUSALS: readonly ModelRefusal[] = Object.values(MODEL_REFUSAL);

// One configured model, and the settings its refusals were learned with.
// Editing the model or its provider's endpoint changes `config`, which
// forgets them.
export type ModelRef = { key: string; config: string };

type LearnedLimits = { config: string; refuses: ModelRefusal[] };

// By ModelRef key. Kept on this device only.
export type LearnedModelLimits = Record<string, LearnedLimits>;

export function modelRef({
  providerId,
  provider,
  model,
}: ModelChoice): ModelRef {
  return {
    key: JSON.stringify([providerId, model.id]),
    config: JSON.stringify([provider.type, provider.baseUrl, model]),
  };
}

export function learnedRefusals(
  learned: LearnedModelLimits,
  ref: ModelRef,
): ModelRefusal[] {
  const entry = learned[ref.key];
  return entry?.config === ref.config ? entry.refuses : [];
}

export function withRefusal(
  learned: LearnedModelLimits,
  ref: ModelRef,
  refusal: ModelRefusal,
): LearnedModelLimits {
  const refuses = learnedRefusals(learned, ref);
  if (refuses.includes(refusal)) return learned;
  return {
    ...learned,
    [ref.key]: { config: ref.config, refuses: [...refuses, refusal] },
  };
}

// Drops what was learned for models that are gone or have been edited since.
export function forgetEditedModels(
  learned: LearnedModelLimits,
  providers: ProviderState,
): LearnedModelLimits {
  const current = new Map(
    Object.entries(providers).flatMap(([providerId, provider]) =>
      (provider.models || []).map((model) => {
        const ref = modelRef({ providerId, provider, model });
        return [ref.key, ref.config] as const;
      }),
    ),
  );
  const kept = Object.entries(learned).filter(
    ([key, entry]) => current.get(key) === entry.config,
  );
  return kept.length === Object.keys(learned).length
    ? learned
    : Object.fromEntries(kept);
}

export function normalizeLearnedModelLimits(
  value: unknown,
): LearnedModelLimits {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (!isRecord(entry) || typeof entry.config !== "string") return [];
      const refuses = knownValues(REFUSALS, entry.refuses);
      return refuses.length ? [[key, { config: entry.config, refuses }]] : [];
    }),
  );
}
