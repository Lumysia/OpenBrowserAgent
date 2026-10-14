import { languageName } from "../../../shared/language-name";
import {
  createMarkedStreamParser,
  markItems,
} from "../../../shared/page-translate/marked-stream";
import { stripPlaceholders } from "../../../shared/page-translate/placeholders";
import type { ProviderModel } from "../../pi-provider";
import {
  QUICK_TASK_PRIORITY,
  quickTaskConcurrency,
  requestQuickText,
} from "../../quick-tasks";
import type { EngineRequest, TranslationEngine } from "./types";

// Changes when the prompt changes, so cached translations from an older
// prompt aren't reused.
export const MODEL_PROMPT_VERSION = 1;

// How often the item being written is sent to the page.
const PARTIAL_INTERVAL_MS = 80;

export function modelEngine(model: ProviderModel): TranslationEngine {
  const identity = `${model.provider}|${model.baseUrl}|${model.modelName}`;
  return {
    id: `model:${identity}`,
    cacheKey: `model:${MODEL_PROMPT_VERSION}:${identity}`,
    limits: {
      concurrency: quickTaskConcurrency(model),
      maxItems: 8,
      maxChars: 1800,
      firstItems: 3,
    },
    translate: (request) => translateWithModel(model, request),
  };
}

async function translateWithModel(
  model: ProviderModel,
  request: EngineRequest,
) {
  const parser = createMarkedStreamParser();
  const ids = new Set(request.items.map((item) => item.id));
  const emit = (items: Array<{ id: number; text: string }>) => {
    for (const item of items)
      if (ids.has(item.id)) request.onItem(item.id, item.text);
  };
  let sentAt = 0;
  const partial = () => {
    const now = Date.now();
    if (!request.onPartial || now - sentAt < PARTIAL_INTERVAL_MS) return;
    const item = parser.partial();
    if (!item || !ids.has(item.id)) return;
    sentAt = now;
    request.onPartial(item.id, stripPlaceholders(item.text));
  };
  // Placeholders keep waiting while a model thinks: only answer text
  // reaches the parser.
  await requestQuickText(
    model,
    modelPrompt(request),
    QUICK_TASK_PRIORITY.background,
    {
      signal: request.signal,
      onText: (delta) => {
        emit(parser.push(delta));
        partial();
      },
    },
  );
  emit(parser.end());
}

// Byte-stable for a language, so providers can cache the system prompt.
export function modelPrompt(
  request: Pick<EngineRequest, "items" | "target" | "pageTitle" | "terms">,
) {
  const language = languageName(request.target);
  const system = [
    `You are a professional translator. Translate text from a web page into ${language}.`,
    "",
    "The input is a list of items. Each item starts with its own line [[n]], and the list ends with [[end]].",
    "",
    "Rules:",
    "- Answer with every item: its [[n]] line, then its translation on the next lines. End with a line [[end]]. Write nothing else: no notes, no code fences.",
    "- Keep each item's number. Never merge, split or reorder items.",
    "- Keep the markers <b1>…</b1> and {1} exactly as written, around the words they belong to. They stand for links, formatting and code.",
    "- Keep code, URLs, e-mail addresses and numbers unchanged.",
    `- If an item is already in ${language}, copy it unchanged.`,
    "- Translate naturally, as a native speaker would write it, in the tone of the page.",
  ].join("\n");
  const title = request.pageTitle?.trim();
  const terms = request.terms?.length
    ? [
        "Earlier translations on this page. Write the names in them the same way:",
        ...request.terms.map(
          ({ source, translation }) => `- ${source}\n  ${translation}`,
        ),
        "",
      ]
    : [];
  const prompt = [
    ...(title ? [`Page title: ${title}`, ""] : []),
    ...terms,
    markItems(request.items),
  ].join("\n");
  return { system, prompt };
}
