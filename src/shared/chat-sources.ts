import {
  CHAT_PART_STATE,
  isToolPartType,
  type ChatPart,
  type ChatSource,
} from "./types";

export function mergeChatSources(
  current: ChatSource[] = [],
  next: ChatSource[],
) {
  const merged = [...current];
  for (const source of next) {
    const key = sourceKey(source);
    const existingIndex = merged.findIndex((item) => sourceKey(item) === key);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...source,
        id: merged[existingIndex].id,
      };
    } else {
      merged.push({ ...source, id: `source_${merged.length + 1}` });
    }
  }
  return merged;
}

export function assignChatSources(
  current: ChatSource[] = [],
  next: ChatSource[],
) {
  const merged = mergeChatSources(current, next);
  return {
    sources: merged,
    added: merged.slice(current.length),
  };
}

// Sources a finished tool part added, as the background attached them.
export function extractSourcesFromPart(part?: ChatPart): ChatSource[] {
  if (!part || !isToolPartType(part.type)) return [];
  if (part.state !== CHAT_PART_STATE.outputAvailable) return [];
  const output = recordValue(part.output);
  return Array.isArray(output._sources)
    ? output._sources
        .map((source) => recordValue(source) as unknown as ChatSource)
        .filter((source) => source.id && source.title)
    : [];
}

// Pages an MCP tool result points to.
export function mcpResultSources(output: Record<string, unknown>) {
  return mcpSources(output, Date.now());
}

function mcpSources(output: Record<string, unknown>, now: number) {
  const result = recordValue(output.result);
  const sources: ChatSource[] = [];
  const content = Array.isArray(result.content) ? result.content : [];

  for (const item of content) {
    const block = recordValue(item);
    const uri = stringValue(block.uri || block.url);
    if (uri)
      sources.push(
        compactSource({
          id: "",
          kind: "page",
          title: stringValue(block.title || block.name) || uri,
          url: uri,
          snippet: stringValue(block.text),
          createdAt: now,
        }),
      );
    sources.push(...mcpTextSources(stringValue(block.text), now));
  }

  const structured = recordValue(result.structuredContent);
  if (Object.keys(structured).length)
    sources.push(...mcpStructuredSources(structured, now));

  return dedupeSources(sources);
}

function mcpTextSources(text: string, now: number) {
  if (!text) return [];
  return text
    .split(/\n\s*---\s*\n/g)
    .flatMap((block) => sourcesFromTextBlock(block, now));
}

function sourcesFromTextBlock(block: string, now: number) {
  const urls = [...block.matchAll(/^URL:\s*(https?:\/\/\S+)\s*$/gim)];
  return urls.map((match) => {
    const url = match[1];
    const beforeUrl = block.slice(0, match.index || 0);
    const afterUrl = block.slice((match.index || 0) + match[0].length);
    return compactSource({
      id: "",
      kind: "page",
      title: titleNearUrl(beforeUrl) || url,
      url,
      snippet: snippetNearUrl(afterUrl),
      createdAt: now,
    });
  });
}

function titleNearUrl(text: string) {
  const titleLine = [...text.matchAll(/^Title:\s*(.+)$/gim)].pop()?.[1];
  if (titleLine) return titleLine.trim();
  const headingLine = [...text.matchAll(/^#\s+(.+)$/gm)].pop()?.[1];
  return headingLine?.trim() || "";
}

function snippetNearUrl(text: string) {
  return text
    .replace(/^Published:\s*.*$/gim, "")
    .replace(/^Author:\s*.*$/gim, "")
    .replace(/^Highlights:\s*/gim, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\[\.\.\.\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mcpStructuredSources(value: Record<string, unknown>, now: number) {
  const candidates = Array.isArray(value.results)
    ? value.results
    : Array.isArray(value.items)
      ? value.items
      : [];
  return candidates.flatMap((item) => {
    const record = recordValue(item);
    const url = stringValue(record.url || record.uri || record.link);
    if (!url) return [];
    return [
      compactSource({
        id: "",
        kind: "page",
        title: stringValue(record.title || record.name) || url,
        url,
        snippet: stringValue(record.text || record.snippet || record.summary),
        createdAt: now,
      }),
    ];
  });
}

function dedupeSources(sources: ChatSource[]) {
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

function compactSource(source: ChatSource) {
  return {
    ...source,
    title: source.title.slice(0, 160),
    snippet: source.snippet?.replace(/\s+/g, " ").trim().slice(0, 800),
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
