import type { ProviderId } from "../shared/types";

// Quick tasks (smart bar actions, page translation) ask the model to think as
// little as the endpoint allows: a thinking model otherwise reasons for
// seconds before the first word of a short answer, and the answer is no
// better for it. Each API has its own switch; some only lower the effort.

type Payload = Record<string, unknown>;
export type PayloadPatch = (payload: Payload) => Payload;

type QuickModel = { provider: ProviderId; baseUrl: string; modelName: string };

// The bare model id: "openai/gpt-5-mini" -> "gpt-5-mini".
function modelId(modelName: string) {
  return modelName.toLowerCase().split("/").pop() || "";
}

// The lowest reasoning_effort an OpenAI reasoning model accepts; undefined
// for other models, which reject the field.
export function lowestOpenAiEffort(modelName: string) {
  const id = modelId(modelName);
  if (/^gpt-5\.\d/.test(id)) return "none";
  if (/^gpt-5(?!-chat)/.test(id)) return "minimal";
  if (/^o\d/.test(id) || /^gpt-oss/.test(id)) return "low";
  return undefined;
}

// Gemini 3 sets a level (Pro has no "minimal"); Gemini 2.5 a token budget
// (2.5 Pro cannot turn thinking off). Older models do not think.
function geminiThinkingConfig(modelName: string) {
  const id = modelId(modelName);
  if (/gemini-3(\.\d+)?-pro/.test(id)) return { thinkingLevel: "LOW" };
  if (/gemini-3(\.\d+)?-flash|gemini-flash(-lite)?-latest/.test(id))
    return { thinkingLevel: "MINIMAL" };
  if (/gemini-2\.5-pro/.test(id)) return { thinkingBudget: 128 };
  if (/gemini-2\.5/.test(id)) return { thinkingBudget: 0 };
  return undefined;
}

const OPENAI_HOST = "api.openai.com";

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Fields for an OpenAI-compatible chat completions request, by provider type.
function chatCompletionsFields(model: QuickModel): Payload {
  const effort = lowestOpenAiEffort(model.modelName);
  const openAiEffort: Payload = effort ? { reasoning_effort: effort } : {};
  switch (model.provider) {
    case "ollama":
      // Ollama maps "none" to think: false.
      return { reasoning_effort: "none" };
    case "deepseek":
    case "glm":
      return { thinking: { type: "disabled" } };
    case "openrouter":
      return { reasoning: { effort: effort || "none" } };
    case "openai":
      // Any other server is likely llama.cpp, vLLM or SGLang, whose chat
      // templates (Qwen, DeepSeek, GLM…) take enable_thinking.
      return hostOf(model.baseUrl) === OPENAI_HOST
        ? openAiEffort
        : {
            ...openAiEffort,
            chat_template_kwargs: { enable_thinking: false },
          };
    default:
      return openAiEffort;
  }
}

// How to change a request so the model thinks least, or undefined when the
// endpoint has no switch for it.
export function quickReasoningPatch(
  model: QuickModel,
): PayloadPatch | undefined {
  switch (model.provider) {
    case "anthropic":
      // Pi sends no thinking block unless asked, so Claude answers at once.
      return undefined;
    case "gemini": {
      const thinkingConfig = geminiThinkingConfig(model.modelName);
      if (!thinkingConfig) return undefined;
      return (payload) => ({
        ...payload,
        config: { ...(payload.config as Payload), thinkingConfig },
      });
    }
    case "openai-responses": {
      const effort = lowestOpenAiEffort(model.modelName);
      if (!effort) return undefined;
      return ({ include: _include, ...payload }) => ({
        ...payload,
        reasoning: { effort },
      });
    }
    default: {
      const fields = chatCompletionsFields(model);
      if (!Object.keys(fields).length) return undefined;
      return (payload) => ({ ...payload, ...fields });
    }
  }
}

// A request error that names a field the quick-task switches add: the
// endpoint does not know it, or the model does not take that value.
export function rejectsQuickReasoning(error: string) {
  return /reasoning|thinking|chat_template|unrecogni[sz]ed|unknown (?:field|param|argument|name)|extra (?:fields|inputs)/i.test(
    error,
  );
}
