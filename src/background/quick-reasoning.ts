import type {
  Api,
  Model,
  OpenAICompletionsCompat,
  ThinkingLevel,
} from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import { isLocalEndpoint } from "../shared/provider-consent";
import {
  THINKING_SWITCH,
  type ThinkingSwitch,
} from "../shared/thinking-switch";
import { providerType, type ProviderId } from "../shared/providers";
import { catalogModel } from "./model-catalog";

// Quick tasks (smart bar actions, page translation) ask the model to think
// as little as it allows: a thinking model otherwise reasons for seconds
// before the first word of a short answer, and the answer is no better for
// it. What a model allows comes from Pi's model catalog; Pi then writes the
// request fields for that level. Models the catalog does not know get only
// what their provider type defines, or what the provider's thinking switch
// says.

type QuickModel = {
  provider: ProviderId;
  baseUrl: string;
  modelName: string;
  thinkingSwitch?: ThinkingSwitch;
};

// The model to send a quick request with, and the thinking level to ask
// for (Pi's `reasoning` option; none for "off").
type QuickThinking = { model: Model<Api>; level?: ThinkingLevel };

type ThinkingFormat = NonNullable<OpenAICompletionsCompat["thinkingFormat"]>;

// Catalog compat flags that decide how Pi writes a thinking level.
const THINKING_COMPAT_KEYS = [
  "thinkingFormat",
  "supportsReasoningEffort",
  "chatTemplateKwargs",
  "forceAdaptiveThinking",
] as const;

// chat_template_kwargs.enable_thinking, as llama.cpp, vLLM and SGLang pass
// it to the model's chat template (Qwen, DeepSeek, GLM…).
const CHAT_TEMPLATE_COMPAT = {
  thinkingFormat: "chat-template",
  chatTemplateKwargs: { enable_thinking: { $var: "thinking.enabled" } },
} satisfies OpenAICompletionsCompat;

// reasoning_effort "none" for a model whose levels are unknown. Ollama
// defines it as thinking off for every model it serves.
const EFFORT_NONE = {
  reasoning: true,
  thinkingLevelMap: { off: "none" },
  compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
} as const;

function lowestLevel(model: Model<Api>): ThinkingLevel | undefined {
  const level = getSupportedThinkingLevels(model)[0];
  return level === "off" ? undefined : level;
}

function withCompat(model: Model<Api>, compat: object): Model<Api> {
  return { ...model, compat: { ...model.compat, ...compat } } as Model<Api>;
}

// The request model with the catalog's thinking data for this model.
function fromCatalog(
  model: Model<Api>,
  known: Model<Api>,
  format: ThinkingFormat,
): QuickThinking {
  const knownCompat = (known.compat || {}) as Record<string, unknown>;
  const compat: Record<string, unknown> =
    known.api === model.api
      ? Object.fromEntries(
          THINKING_COMPAT_KEYS.filter((key) => key in knownCompat).map(
            (key) => [key, knownCompat[key]],
          ),
        )
      : {};
  if (model.api === "openai-completions") compat.thinkingFormat = format;
  const quick = withCompat(
    {
      ...model,
      reasoning: known.reasoning,
      thinkingLevelMap: known.thinkingLevelMap,
    },
    compat,
  );
  return { model: quick, level: lowestLevel(quick) };
}

function chatTemplate(model: Model<Api>): QuickThinking {
  return {
    // Asked for no level, Pi sends enable_thinking: false.
    model: withCompat({ ...model, reasoning: true }, CHAT_TEMPLATE_COMPAT),
  };
}

function effortNone(model: Model<Api>): QuickThinking {
  return {
    model: withCompat(
      {
        ...model,
        reasoning: EFFORT_NONE.reasoning,
        thinkingLevelMap: EFFORT_NONE.thinkingLevelMap,
      },
      EFFORT_NONE.compat,
    ),
  };
}

// How to send a quick request to `model`, or undefined to send it as is.
export function quickThinking(
  config: QuickModel,
  model: Model<Api>,
): QuickThinking | undefined {
  const known = catalogModel(config.provider, config.modelName);
  const type = providerType(config.provider);
  const format = type.thinkingFormat || "openai";
  if (model.api !== "openai-completions")
    return known ? fromCatalog(model, known, format) : undefined;
  switch (config.thinkingSwitch || THINKING_SWITCH.auto) {
    case THINKING_SWITCH.none:
      return undefined;
    case THINKING_SWITCH.chatTemplate:
      return chatTemplate(model);
    case THINKING_SWITCH.reasoningEffort:
      return known ? fromCatalog(model, known, "openai") : effortNone(model);
    default:
      if (known) return fromCatalog(model, known, format);
      if (type.quickReasoningEffort) return effortNone(model);
      // Servers on this device or the local network (llama.cpp, vLLM,
      // SGLang) take the template switch; a cloud service is not sent a
      // field it may not know.
      if (isLocalEndpoint(config.baseUrl)) return chatTemplate(model);
      return undefined;
  }
}

// Where each API carries the fields Pi writes for a thinking level.
const THINKING_FIELDS: Partial<Record<Api, string[][]>> = {
  "openai-completions": [
    ["reasoning_effort"],
    ["reasoning"],
    ["thinking"],
    ["enable_thinking"],
    ["chat_template_kwargs"],
  ],
  "openai-responses": [["reasoning"], ["include"]],
  "anthropic-messages": [["thinking"], ["output_config"]],
  "google-generative-ai": [["config", "thinkingConfig"]],
};

function at(payload: unknown, path: string[]) {
  return path.reduce<unknown>(
    (value, key) =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined,
    payload,
  );
}

// Field names a nested value adds: its keys of more than one word (single
// words such as "type" or "effort" are slots of the field around them).
function nestedNames(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    ...(/[_-]|[a-z][A-Z]/.test(key) ? [key] : []),
    ...nestedNames(inner),
  ]);
}

// The names of the thinking fields in a quick request's payload, which the
// plain request does not send.
export function thinkingFieldNames(api: Api, payload: unknown): string[] {
  return (THINKING_FIELDS[api] || []).flatMap((path) => {
    const value = at(payload, path);
    return value === undefined
      ? []
      : [path[path.length - 1], ...nestedNames(value)];
  });
}
