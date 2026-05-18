import { BROWSER_TOOL_NAME } from "./browser-tools";
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

export function extractSourcesFromPart(part?: ChatPart): ChatSource[] {
  if (!part || !isToolPartType(part.type)) return [];
  if (part.state !== CHAT_PART_STATE.outputAvailable) return [];
  const output = recordValue(part.output);
  if (Array.isArray(output._sources))
    return output._sources
      .map((source) => recordValue(source) as unknown as ChatSource)
      .filter((source) => source.id && source.title);
  const input = recordValue(part.input);
  const name = part.toolName || part.type.replace(/^tool-/, "");
  return extractSourcesFromTool(name, input, output);
}

export function extractSourcesFromTool(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): ChatSource[] {
  const now = Date.now();

  if (
    name === BROWSER_TOOL_NAME.getTabContent &&
    Array.isArray(output.contents)
  ) {
    return output.contents.flatMap((item) => {
      const tab = recordValue(item);
      return sourceFromPage(tab, now, stringValue(tab.markdown));
    });
  }
  if (name === BROWSER_TOOL_NAME.getCurrentTab)
    return sourceFromPage(output, now);
  if (name === BROWSER_TOOL_NAME.openNewTabWithURL && output.tab) {
    return sourceFromPage(recordValue(output.tab), now);
  }
  if (name === BROWSER_TOOL_NAME.openSearchTab) {
    const query = stringValue(input.query);
    return [
      compactSource({
        id: "",
        kind: "search",
        title: query || "Search",
        url: query
          ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
          : undefined,
        tabId: numberValue(output.tabId),
        createdAt: now,
      }),
    ];
  }
  if (name === BROWSER_TOOL_NAME.readUploadedAttachment) {
    return [
      compactSource({
        id: "",
        kind: "file",
        title:
          stringValue(output.name) ||
          stringValue(input.attachmentId) ||
          "Attachment",
        snippet: stringValue(output.text),
        createdAt: now,
      }),
    ];
  }
  if (
    name === BROWSER_TOOL_NAME.readSkill ||
    name === BROWSER_TOOL_NAME.readSkillFile
  ) {
    return [
      compactSource({
        id: "",
        kind: "skill",
        title:
          [stringValue(output.name), stringValue(output.path)]
            .filter(Boolean)
            .join(" / ") || "Skill",
        snippet: stringValue(output.content),
        createdAt: now,
      }),
    ];
  }
  if (name === BROWSER_TOOL_NAME.generateImage) {
    return [
      compactSource({
        id: "",
        kind: "image",
        title: stringValue(output.model) || "Generated image",
        url: stringValue(output.image).startsWith("http")
          ? stringValue(output.image)
          : undefined,
        snippet: stringValue(output.prompt) || stringValue(input.prompt),
        createdAt: now,
      }),
    ];
  }
  if (name === BROWSER_TOOL_NAME.downloadTabToMarkdown) {
    return [
      compactSource({
        id: "",
        kind: "file",
        title: stringValue(output.filename) || "Downloaded markdown",
        createdAt: now,
      }),
    ];
  }
  if (name === BROWSER_TOOL_NAME.downloadAllImagesInTab) {
    return [
      compactSource({
        id: "",
        kind: "tool",
        title: "Downloaded images",
        tabId: numberValue(input.tabId),
        createdAt: now,
      }),
    ];
  }
  return [];
}

export function renderSourcesForPrompt(sources: ChatSource[] = []) {
  if (!sources.length) return "";
  return `<sources>\n${sources.map(renderSourceLine).join("\n")}\n</sources>`;
}

function renderSourceLine(source: ChatSource) {
  return `- [${source.id}] ${source.title}${source.url ? `\n  URL: ${source.url}` : ""}${source.snippet ? `\n  Snippet: ${source.snippet.slice(0, 500)}` : ""}`;
}

function sourceFromPage(
  value: Record<string, unknown>,
  now: number,
  snippet = "",
) {
  const title = stringValue(value.title) || stringValue(value.url) || "Page";
  if (!title && !value.url) return [];
  return [
    compactSource({
      id: "",
      kind: "page",
      title,
      url: stringValue(value.url),
      tabId: numberValue(value.tabId) || numberValue(value.id),
      snippet,
      createdAt: now,
    }),
  ];
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

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
