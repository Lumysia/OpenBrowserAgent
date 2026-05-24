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

  if (name === BROWSER_TOOL_NAME.inspectPage && Array.isArray(output.pages)) {
    return output.pages.flatMap((item) => {
      const tab = recordValue(item);
      return sourceFromPage(tab, now, stringValue(tab.markdown));
    });
  }
  if (name === BROWSER_TOOL_NAME.getCurrentTab)
    return sourceFromPage(output, now);
  if (
    name === BROWSER_TOOL_NAME.manageTabs &&
    input.operation === "open" &&
    output.tab
  ) {
    return sourceFromPage(recordValue(output.tab), now);
  }
  if (
    name === BROWSER_TOOL_NAME.manageTabs &&
    input.operation === "webSearch"
  ) {
    const query = stringValue(input.query);
    return [
      compactSource({
        id: "",
        kind: "search",
        title: query || "Search",
        url: stringValue(recordValue(output.tab).url),
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
    name === BROWSER_TOOL_NAME.manageSkills &&
    (input.operation === "read" || input.operation === "readFile")
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
  if (name.startsWith("mcp__")) return mcpSources(output, now);
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
