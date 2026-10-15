import { languageName } from "../../../shared/language-name";
import {
  createMarkedStreamParser,
  markItems,
} from "../../../shared/page-translate/marked-stream";
import { stripPlaceholders } from "../../../shared/page-translate/placeholders";
import { PAGE_TRANSLATE_CONTENT } from "../../../shared/page-translate/protocol";
import type { ProviderModel } from "../../pi-provider";
import {
  QUICK_TASK_PRIORITY,
  quickTaskConcurrency,
  requestQuickText,
} from "../../quick-tasks";
import type { EngineRequest, TranslationEngine } from "./types";

// Changes when the prompt changes, so cached translations from an older
// prompt aren't reused.
export const MODEL_PROMPT_VERSION = 2;
// The same for the subtitle prompt.
export const MODEL_SUBTITLE_PROMPT_VERSION = 1;

// How often the item being written is sent to the page.
const PARTIAL_INTERVAL_MS = 80;

export function modelEngine(model: ProviderModel): TranslationEngine {
  const identity = `${model.provider}|${model.baseUrl}|${model.modelName}`;
  return {
    id: `model:${identity}`,
    cacheKey: `model:${MODEL_PROMPT_VERSION}:${identity}`,
    contentCacheKeys: {
      [PAGE_TRANSLATE_CONTENT.subtitles]: `model:subtitles:${MODEL_SUBTITLE_PROMPT_VERSION}:${identity}`,
    },
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

// Byte-stable for a language and content, so providers can cache the
// system prompt; what changes per page and batch goes in the user prompt.
export function modelPrompt(
  request: Pick<
    EngineRequest,
    | "items"
    | "target"
    | "pageTitle"
    | "pageDescription"
    | "context"
    | "terms"
    | "content"
  >,
) {
  if (request.content === PAGE_TRANSLATE_CONTENT.subtitles)
    return subtitlePrompt(request);
  const language = languageName(request.target);
  const system = [
    `You are a professional translator. Translate text from a web page into ${language}.`,
    "",
    ...ITEM_FORMAT,
    "- Keep the markers <b1>…</b1> and {1} exactly as written, around the words they belong to. They stand for links, formatting and code.",
    "- Keep code, URLs, e-mail addresses and numbers unchanged.",
    `- If an item is already in ${language}, copy it unchanged.`,
    "- Translate naturally, as a native speaker would write it, in the tone of the page.",
    `- An item's role says what it is on the page: write headings as headings, and buttons, menu items and labels short, the way ${language} interfaces write them. Items without a role are running text.`,
    "- Everything before the first [[n]] line is reference only: the page's title and description, the section the items are in, the text just before them, their roles and earlier translations. Use it to understand the items; never translate it or write it in the answer.",
  ].join("\n");
  const title = request.pageTitle?.trim();
  const description = request.pageDescription?.trim();
  const { headings, before } = request.context ?? {};
  // Items are named in words here: a [[n]] line outside the list reads to
  // some models as an item to answer.
  const roles = request.items.flatMap((item) =>
    item.role ? [`item ${item.id} is a ${item.role}`] : [],
  );
  const reference = [
    ...(title ? [`Page title: ${title}`] : []),
    ...(description ? [`Page description: ${description}`] : []),
    ...(headings?.length ? [`Section: ${headings.join(" › ")}`] : []),
    ...(before ? [`Just before the items: ${before}`] : []),
    ...(roles.length ? [`Roles: ${roles.join(", ")}`] : []),
  ];
  return { system, prompt: userPrompt(request, reference, "on this page") };
}

const ITEM_FORMAT = [
  "The input is a list of items. Each item starts with its own line [[n]], and the list ends with [[end]].",
  "",
  "Rules:",
  "- Answer with every item: its [[n]] line, then its translation on the next lines. End with a line [[end]]. Write nothing else: no notes, no code fences.",
  "- Keep each item's number. Never merge, split or reorder items.",
];

// Subtitles: consecutive lines said in a video, read while they are said.
function subtitlePrompt(
  request: Pick<
    EngineRequest,
    "items" | "target" | "pageTitle" | "context" | "terms"
  >,
) {
  const language = languageName(request.target);
  const system = [
    `You are a professional subtitle translator. Translate the subtitles of a video into ${language}.`,
    "",
    ...ITEM_FORMAT,
    "- The items are consecutive subtitle lines, in the order they are said. A sentence may continue in the next item: translate each item's part of it, so each item still matches its own line.",
    "- Write the way people speak, in the tone of the video, and keep each item about as short as its line: viewers read it while it is said.",
    "- Keep numbers and names as they are said.",
    `- If an item is already in ${language}, copy it unchanged.`,
    "- Everything before the first [[n]] line is reference only: the video's title, the lines said just before the items and earlier translations. Use it to understand the items; never translate it or write it in the answer.",
  ].join("\n");
  const title = request.pageTitle?.trim();
  const before = request.context?.before;
  const reference = [
    ...(title ? [`Video title: ${title}`] : []),
    ...(before ? [`Said just before the items: ${before}`] : []),
  ];
  return { system, prompt: userPrompt(request, reference, "in this video") };
}

function userPrompt(
  request: Pick<EngineRequest, "items" | "terms">,
  reference: string[],
  where: string,
) {
  const terms = request.terms?.length
    ? [
        `Earlier translations ${where}. Write the names in them the same way:`,
        ...request.terms.map(
          ({ source, translation }) => `- ${source}\n  ${translation}`,
        ),
        "",
      ]
    : [];
  return [
    ...(reference.length ? [...reference, ""] : []),
    ...terms,
    markItems(request.items),
  ].join("\n");
}
