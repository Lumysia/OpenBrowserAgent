import type { Api, Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";
import { MINIMAX_MODELS } from "@earendil-works/pi-ai/providers/minimax.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";
import { ZAI_MODELS } from "@earendil-works/pi-ai/providers/zai.models";
import type { ProviderId } from "../shared/providers";

// Pi's model catalog for the services a provider type stands for: what each
// model supports (thinking levels among it). Provider types that take any
// server (Ollama, AIHubMix, gateways) have no catalog of their own.
const CATALOGS: Partial<Record<ProviderId, Record<string, Model<Api>>>> = {
  openai: OPENAI_MODELS,
  "openai-responses": OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  gemini: GOOGLE_MODELS,
  deepseek: DEEPSEEK_MODELS,
  openrouter: OPENROUTER_MODELS,
  glm: ZAI_MODELS,
  minimax: MINIMAX_MODELS,
};

// The catalog entry for exactly this model id, if the catalog has one.
export function catalogModel(
  provider: ProviderId,
  modelName: string,
): Model<Api> | undefined {
  const catalog = CATALOGS[provider];
  return catalog && Object.hasOwn(catalog, modelName)
    ? catalog[modelName]
    : undefined;
}

// The model's output limit, when Pi's catalog knows the model. Unknown
// models get none, and the endpoint applies its own default.
export function knownOutputLimit(provider: ProviderId, modelName: string) {
  return catalogModel(provider, modelName)?.maxTokens || undefined;
}
