import type {
  Api,
  Model,
  OpenAICompletionsCompat,
  ThinkingLevel,
} from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import { isLocalEndpoint } from "../shared/provider-consent";
import {
  QUICK_TASK_REASONING,
  REASONING_EFFORT,
  type RequestReasoning,
} from "../shared/reasoning";
import {
  THINKING_SWITCH,
  type ThinkingSwitch,
} from "../shared/thinking-switch";
import { providerType, type ProviderId } from "../shared/providers";
import { catalogModel } from "./model-catalog";

// How a request asks the model to think, and to show its thinking.
//
// The user's effort and the quick-task level go to Pi as a thinking level,
// which Pi writes in each API's own fields (Anthropic adaptive effort or
// budget with interleaved thinking, Gemini thinking level or budget,
// Responses effort with summaries). What a model allows comes from Pi's
// model catalog. Chat Completions services take the effort in their
// provider type's field instead (reasoningRequestParams), since one type
// stands for many servers.
//
// Without a level ("default"), the endpoint decides how much the model
// thinks, and the request only asks to be shown that thinking: summarized
// thinking from a Claude model that thinks by default, Gemini's thoughts,
// a Responses summary. Chat Completions servers send theirs unasked.
//
// Quick tasks (smart bar actions, page translation) ask the model to think
// as little as it allows: a thinking model otherwise reasons for seconds
// before the first word of a short answer, and the answer is no better for
// it. Models the catalog does not know get only what their provider type
// defines, or what the provider's thinking switch says.

type RequestModel = {
  provider: ProviderId;
  baseUrl: string;
  modelName: string;
  thinkingSwitch?: ThinkingSwitch;
};

// The model to send the request with, and how: at Pi's thinking level
// (`streamSimple`; no level turns thinking off), or as is with what shows
// the endpoint's own thinking (`stream`).
export type RequestThinking =
  | { model: Model<Api>; level?: ThinkingLevel; visible?: undefined }
  | { model: Model<Api>; visible: VisibleThinking; level?: undefined };

type VisibleThinking = {
  // Pi's stream options for it (Gemini's includeThoughts).
  options: { thinking?: { enabled: true } };
  // A Responses reasoning summary, which Pi asks for only with an effort
  // (see withVisibleThinking).
  summary: boolean;
};

type ThinkingFormat = NonNullable<OpenAICompletionsCompat["thinkingFormat"]>;

// Catalog compat flags that decide how Pi writes a thinking level.
const THINKING_COMPAT_KEYS = [
  "thinkingFormat",
  "supportsReasoningEffort",
  "chatTemplateKwargs",
  "forceAdaptiveThinking",
  "supportsMidConvoEffort",
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

// The Responses include that returns reasoning for replay with store off.
const ENCRYPTED_REASONING = "reasoning.encrypted_content";

function lowestLevel(model: Model<Api>): ThinkingLevel | undefined {
  const level = getSupportedThinkingLevels(model)[0];
  return level === "off" ? undefined : level;
}

function withCompat(model: Model<Api>, compat: object): Model<Api> {
  return { ...model, compat: { ...model.compat, ...compat } } as Model<Api>;
}

// The request model with the catalog's thinking data for this model. A
// model sent without a level keeps the request model's levels, so Pi writes
// no "off" value for it.
function fromCatalog(
  model: Model<Api>,
  known: Model<Api>,
  format: ThinkingFormat,
  levels: boolean,
): Model<Api> {
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
  return withCompat(
    {
      ...model,
      reasoning: known.reasoning,
      ...(levels ? { thinkingLevelMap: known.thinkingLevelMap } : {}),
    },
    compat,
  );
}

function lowest(model: Model<Api>): RequestThinking {
  return { model, level: lowestLevel(model) };
}

function chatTemplate(model: Model<Api>): RequestThinking {
  return {
    // Asked for no level, Pi sends enable_thinking: false.
    model: withCompat({ ...model, reasoning: true }, CHAT_TEMPLATE_COMPAT),
  };
}

function effortNone(model: Model<Api>): RequestThinking {
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
function quickThinking(
  config: RequestModel,
  model: Model<Api>,
): RequestThinking | undefined {
  const known = catalogModel(config.provider, config.modelName);
  const type = providerType(config.provider);
  const format = type.thinkingFormat || "openai";
  if (model.api !== "openai-completions")
    return known ? lowest(fromCatalog(model, known, format, true)) : undefined;
  switch (config.thinkingSwitch || THINKING_SWITCH.auto) {
    case THINKING_SWITCH.none:
      return undefined;
    case THINKING_SWITCH.chatTemplate:
      return chatTemplate(model);
    case THINKING_SWITCH.reasoningEffort:
      return known
        ? lowest(fromCatalog(model, known, "openai", true))
        : effortNone(model);
    default:
      if (known) return lowest(fromCatalog(model, known, format, true));
      if (type.quickReasoningEffort) return effortNone(model);
      // Servers on this device or the local network (llama.cpp, vLLM,
      // SGLang) take the template switch; a cloud service is not sent a
      // field it may not know.
      if (isLocalEndpoint(config.baseUrl)) return chatTemplate(model);
      return undefined;
  }
}

// What shows the thinking a model does by itself. Anthropic needs nothing
// here: Pi asks for summarized thinking from the models the catalog marks
// as thinking by default (supportsMidConvoEffort), and other Claude models
// do not think unless asked.
function visibleThinking(model: Model<Api>): VisibleThinking {
  const reasons = !!model.reasoning;
  return {
    options:
      reasons && model.api === "google-generative-ai"
        ? { thinking: { enabled: true } }
        : {},
    summary: reasons && model.api === "openai-responses",
  };
}

// How to send a request at `reasoning`, or undefined to send it as is.
export function requestThinking(
  config: RequestModel,
  model: Model<Api>,
  reasoning: RequestReasoning | undefined,
): RequestThinking | undefined {
  if (reasoning === QUICK_TASK_REASONING) return quickThinking(config, model);
  // Chat Completions take the effort in the provider type's field.
  if (model.api === "openai-completions") return undefined;
  const known = catalogModel(config.provider, config.modelName);
  const format = providerType(config.provider).thinkingFormat || "openai";
  const effort =
    reasoning && reasoning !== REASONING_EFFORT.default ? reasoning : undefined;
  const base = known ? fromCatalog(model, known, format, !!effort) : model;
  if (effort) return { model: base, level: effort };
  return { model: base, visible: visibleThinking(base) };
}

// The Responses summary Pi writes only with an effort: asked for here
// without one, so the endpoint keeps choosing how much the model reasons.
export function withVisibleThinking(
  payload: unknown,
  visible: VisibleThinking | undefined,
) {
  if (!visible?.summary || !payload || typeof payload !== "object")
    return payload;
  const request = payload as {
    reasoning?: { effort?: string; summary?: string };
    include?: string[];
  };
  if (request.reasoning?.effort === "none") return payload;
  return {
    ...request,
    reasoning: {
      ...request.reasoning,
      summary: request.reasoning?.summary ?? "auto",
    },
    include: [...new Set([...(request.include || []), ENCRYPTED_REASONING])],
  };
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

// The names of the thinking fields in a request's payload, which the plain
// request does not send.
export function thinkingFieldNames(api: Api, payload: unknown): string[] {
  return (THINKING_FIELDS[api] || []).flatMap((path) => {
    const value = at(payload, path);
    return value === undefined
      ? []
      : [path[path.length - 1], ...nestedNames(value)];
  });
}
