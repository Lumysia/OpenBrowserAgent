import { compactSource, dedupeSources } from "./chat-sources";
import type { ChatSource } from "./types";
import { isRecord, recordOf, trimmedString } from "./values";

// The pages an MCP tool result points to, read from what the protocol
// defines: resource links and embedded resources, structured content that
// lists results with URLs, and text lines that hold a single link (search
// servers list each result's URL on its own line). Links inside prose are
// not sources.
export function mcpResultSources(output: Record<string, unknown>) {
  const now = Date.now();
  const result = recordOf(output.result);
  const content = Array.isArray(result.content) ? result.content : [];
  const sources = content.flatMap((item) => blockSources(recordOf(item)));
  if (isRecord(result.structuredContent))
    sources.push(...structuredSources(result.structuredContent));
  return dedupeSources(
    sources.map((source) =>
      compactSource({ id: "", kind: "page", createdAt: now, ...source }),
    ),
  );
}

type Found = Pick<ChatSource, "title" | "url" | "snippet">;

function blockSources(block: Record<string, unknown>): Found[] {
  if (block.type === "resource_link") return linkSource(block);
  if (block.type === "resource") return linkSource(recordOf(block.resource));
  if (block.type === "text") return textSources(trimmedString(block.text));
  return [];
}

function linkSource(link: Record<string, unknown>): Found[] {
  const url = trimmedString(link.uri);
  if (!isHttpUrl(url)) return [];
  return [
    {
      url,
      title: trimmedString(link.title) || trimmedString(link.name) || url,
      snippet: trimmedString(link.description) || trimmedString(link.text),
    },
  ];
}

// A list of results under a common name, each with a URL field.
function structuredSources(value: Record<string, unknown>): Found[] {
  return Object.values(value)
    .filter(Array.isArray)
    .flat()
    .filter(isRecord)
    .flatMap((item) => {
      const url = [item.url, item.uri, item.link]
        .map(trimmedString)
        .find(isHttpUrl);
      if (!url) return [];
      return [
        {
          url,
          title: trimmedString(item.title) || trimmedString(item.name) || url,
          snippet: [item.snippet, item.summary, item.description, item.text]
            .map(trimmedString)
            .find(Boolean),
        },
      ];
    });
}

// A line that is one link: a URL or a Markdown link, after an optional list
// marker and an optional "label:".
const LINK_LINE =
  /^(?:[-*+]\s+|\d+[.)]\s+)?(?:[\p{L}][\p{L}\p{N} _-]{0,30}:\s*)?(?:\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|<?(https?:\/\/[^\s>]+)>?)$/u;
// The marker before a line's text: a heading or list marker, a "label:".
const LINE_MARKER =
  /^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?(?:[\p{L}][\p{L}\p{N} _-]{0,30}:\s*)?/u;
const LABELLED = /^[\p{L}][\p{L}\p{N} _-]{0,30}:\s*(.*)$/u;
// A thematic break separates results.
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
// A short labelled line ("Published: 2024-05-01") is metadata, not text.
const METADATA_MAX_CHARS = 60;

// Each link line is a result: its title is the line above it (within the
// result), its snippet the text below it up to the next result.
function textSources(text: string): Found[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const links = lines.flatMap((line, index) => {
    const match = LINK_LINE.exec(line);
    if (!match) return [];
    let title = index - 1;
    while (title >= 0 && !lines[title]) title--;
    const titled =
      !match[1] &&
      title >= 0 &&
      !RULE.test(lines[title]) &&
      !LINK_LINE.test(lines[title]);
    return [
      {
        index,
        url: match[2] || match[3],
        title: match[1] || (titled ? unmark(lines[title]) : ""),
        start: titled ? title : index,
      },
    ];
  });
  return links.map((link, at) => {
    const below = lines.slice(link.index + 1, links[at + 1]?.start);
    const end = below.findIndex((line) => RULE.test(line));
    return {
      url: link.url,
      title: link.title.trim() || link.url,
      snippet: (end >= 0 ? below.slice(0, end) : below)
        .filter((line) => line && !isMetadata(line))
        .map(unmark)
        .join(" "),
    };
  });
}

function unmark(line: string) {
  return line.replace(LINE_MARKER, "").trim();
}

function isMetadata(line: string) {
  const value = LABELLED.exec(line)?.[1];
  return value !== undefined && value.length < METADATA_MAX_CHARS;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
