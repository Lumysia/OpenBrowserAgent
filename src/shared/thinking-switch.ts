import type { ProviderConfig } from "./types";
import { providerType, type ProviderId } from "./providers";

// How a quick task (smart bar, page translation) tells a chat completions
// endpoint to think as little as it can. "auto" uses the model's entry in
// the model catalog, else what the provider type defines (see
// background/quick-reasoning.ts). The others are for servers whose model
// or template the catalog does not know.
export const THINKING_SWITCH = {
  auto: "auto",
  // chat_template_kwargs.enable_thinking = false (llama.cpp, vLLM, SGLang).
  chatTemplate: "chatTemplate",
  // reasoning_effort, at the model's lowest level ("none" when unknown).
  reasoningEffort: "reasoningEffort",
  // Send nothing: the server picks.
  none: "none",
} as const;

export type ThinkingSwitch =
  (typeof THINKING_SWITCH)[keyof typeof THINKING_SWITCH];

export const THINKING_SWITCH_OPTIONS: ThinkingSwitch[] = [
  THINKING_SWITCH.auto,
  THINKING_SWITCH.chatTemplate,
  THINKING_SWITCH.reasoningEffort,
  THINKING_SWITCH.none,
];

export function hasThinkingSwitch(type: ProviderId) {
  return !!providerType(type).thinkingSwitch;
}

// The provider's switch; "auto" when unset or not offered for its type.
export function providerThinkingSwitch(
  type: ProviderId,
  config: Pick<ProviderConfig, "thinkingSwitch">,
): ThinkingSwitch {
  const value = config.thinkingSwitch;
  return hasThinkingSwitch(type) &&
    value &&
    THINKING_SWITCH_OPTIONS.includes(value)
    ? value
    : THINKING_SWITCH.auto;
}
