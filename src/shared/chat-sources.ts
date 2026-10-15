import { TOOL_OUTPUT_SOURCES } from "./tool-results";
import { SOURCE_SNIPPET_MAX_CHARS, SOURCE_TITLE_MAX_CHARS } from "./config";
import {
  CHAT_PART_STATE,
  isToolPartType,
  type ChatPart,
  type ChatSource,
} from "./types";
import { recordOf } from "./values";

// Sources new to the chat are added; one it already has stays as it is (its
// id is what the replies cite), so finding a page again changes nothing.
export function mergeChatSources(
  current: ChatSource[] = [],
  next: ChatSource[],
) {
  const merged = [...current];
  const known = new Set(merged.map(sourceKey));
  for (const source of next) {
    const key = sourceKey(source);
    if (known.has(key)) continue;
    known.add(key);
    merged.push({ ...source, id: `source_${merged.length + 1}` });
  }
  return merged.length === current.length ? current : merged;
}

// `added` are the sources new to the chat; `cited` every source of `next`
// with its id in the chat, new or found again, once each and in order.
export function assignChatSources(
  current: ChatSource[] = [],
  next: ChatSource[],
) {
  const merged = mergeChatSources(current, next);
  const byKey = new Map(merged.map((source) => [sourceKey(source), source]));
  const cited = [
    ...new Set(next.map((source) => byKey.get(sourceKey(source))!)),
  ];
  return {
    sources: merged,
    added: merged.slice(current.length),
    cited,
  };
}

// Sources a finished tool part added, as the background attached them.
export function extractSourcesFromPart(part?: ChatPart): ChatSource[] {
  if (!part || !isToolPartType(part.type)) return [];
  if (part.state !== CHAT_PART_STATE.outputAvailable) return [];
  const output = recordOf(part.output);
  const sources = output[TOOL_OUTPUT_SOURCES];
  return Array.isArray(sources)
    ? sources
        .map((source) => recordOf(source) as unknown as ChatSource)
        .filter((source) => source.id && source.title)
    : [];
}

export function dedupeSources(sources: ChatSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderSourcesForPrompt(sources: ChatSource[] = []) {
  if (!sources.length) return "";
  return `<sources>\n${sources.map(renderSourceLine).join("\n")}\n</sources>`;
}

// Ids for citing earlier sources; their content was in earlier results.
function renderSourceLine(source: ChatSource) {
  return `- [${source.id}] ${source.title}${source.url ? ` ${source.url}` : ""}`;
}

function sourceKey(source: ChatSource) {
  return source.url || `${source.kind}:${source.tabId || ""}:${source.title}`;
}

export function compactSource(source: ChatSource): ChatSource {
  return {
    ...source,
    title: source.title.slice(0, SOURCE_TITLE_MAX_CHARS),
    snippet:
      source.snippet
        ?.replace(/\s+/g, " ")
        .trim()
        .slice(0, SOURCE_SNIPPET_MAX_CHARS) || undefined,
  };
}
