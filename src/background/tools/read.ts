import {
  ATTACHMENT_KIND,
  base64FromDataUrl,
  isVisionImageMimeType,
} from "../../shared/attachments";
import { base64ToBytes, bytesToBase64 } from "../../shared/binary";
import { documentText } from "../file-text";
import { fetchedHtmlMarkdown } from "../html-markdown";
import { hasToolGroup } from "../../shared/agents";
import { findSkill } from "../../shared/skill-catalog";
import { SKILL_ENTRY_PATH } from "../../shared/skills";
import { readChatAttachment } from "../../shared/chat-attachments";
import { TOOL_NAME } from "../../shared/tool-names";
import type { UploadedAttachment } from "../../shared/types";
import { CONTEXT_POLICY, tokenChars } from "../context/policy";
import { callPage, pageTab } from "../page-agent";
import { pageHeader, pageSource } from "./page";
import {
  fail,
  schema,
  stringArg,
  type RunContext,
  type SourceInput,
  type ToolDefinition,
  type ToolResult,
} from "./types";

// One character range of a longer text, with where to continue.
export function textSlice(
  label: string,
  text: string,
  input: Record<string, unknown>,
  max = tokenChars(CONTEXT_POLICY.readMaxTokens),
) {
  const total = text.length;
  const { offset, end } = sliceRange(text, input, max);
  const position = end < total ? `continue with offset=${end}` : "end";
  return `[${label} | characters ${offset}-${end} of ${total}; ${position}]\n${text.slice(offset, end)}`;
}

// The range textSlice returns: from `offset`, at most `limit` and `max`
// characters.
function sliceRange(text: string, input: Record<string, unknown>, max: number) {
  const offset = Math.min(
    text.length,
    Math.max(0, Math.trunc(Number(input.offset) || 0)),
  );
  const limit = Math.min(
    max,
    Math.max(1, Math.trunc(Number(input.limit) || max)),
  );
  return { offset, end: Math.min(text.length, offset + limit) };
}

export type ReadSource =
  | { kind: "tab"; tabId?: number }
  | { kind: "artifact"; handle: string }
  | { kind: "url"; url: string }
  | { kind: "attachment"; id: string }
  | { kind: "skill"; name: string; path: string }
  | { kind: "workspace"; path: string };

export function parseSource(value: string): ReadSource {
  if (!value || value === "tab") return { kind: "tab" };
  if (/^tab:\d+$/.test(value))
    return { kind: "tab", tabId: Number(value.slice(4)) };
  if (/^art-/.test(value)) return { kind: "artifact", handle: value };
  if (/^(https?:|data:)/i.test(value)) return { kind: "url", url: value };
  if (value.startsWith("skill:")) {
    const [name, ...path] = value.slice(6).split("/");
    return { kind: "skill", name, path: path.join("/") || SKILL_ENTRY_PATH };
  }
  if (value.startsWith("workspace:"))
    return { kind: "workspace", path: value.slice(10) };
  return { kind: "attachment", id: value.replace(/^attachment:/, "") };
}

export const readTool: ToolDefinition = {
  name: TOOL_NAME.read,
  readOnly: true,
  boundedOutput: true,
  timeoutMs: 60_000,
  summary: "Read text in ranges",
  description:
    'Read one source in character ranges: "tab" or "tab:ID" (page text as Markdown; default: active tab), a stored output handle "art-…", a URL (web pages as Markdown of their HTML, fetched with the browser\'s cookies for the site, without running scripts), "attachment:ID", "skill:NAME" or "skill:NAME/PATH", "workspace:PATH". Continue with the offset it reports. Images come back as images; PDF, Word, Excel, PowerPoint and OpenDocument files as their text.',
  parameters: schema({
    source: { type: "string", description: 'What to read. Defaults to "tab".' },
    offset: { type: "number" },
    limit: { type: "number", description: "Characters to return." },
    encoding: {
      type: "string",
      enum: ["text", "base64"],
      description: "base64: the raw bytes of a file or URL.",
    },
  }),
  async execute(input, context) {
    const source = parseSource(stringArg(input.source));
    const { run, signal } = context;
    if (source.kind === "tab") {
      if (!hasToolGroup(run.agent, "pages"))
        return fail("This agent cannot read pages.");
      const tab = await pageTab(source.tabId);
      const { value, title, url } = await callPage<{ text: string }>(
        tab.id,
        "markdown",
        {},
        signal,
      );
      const current = { ...tab, title, url };
      return {
        text: textSlice(pageHeader(current), value.text, input),
        details: {
          source: `tab:${tab.id}`,
          title,
          url,
          chars: value.text.length,
        },
        sources: [pageSource(current)],
      };
    }
    if (source.kind === "artifact") {
      const artifact = await run.readArtifact(source.handle);
      if (!artifact)
        return fail(
          `No stored output "${source.handle}" in this chat. Use a handle from a truncated, masked or unchanged result.`,
        );
      return {
        text: textSlice(
          `${source.handle}: ${artifact.label}`,
          artifact.text,
          input,
        ),
        details: { source: source.handle, label: artifact.label },
      };
    }
    if (source.kind === "url") return readUrl(source.url, input, run, signal);
    if (source.kind === "skill")
      return readSkill(run, source.name, source.path, input);
    if (source.kind === "workspace") {
      const file = run.workspace?.files.find(
        (item) => item.path === source.path,
      );
      if (!run.workspace) return fail("This agent has no workspace.");
      if (!file)
        return fail(
          `No workspace file "${source.path}". Files: ${run.workspace.files.map((item) => item.path).join(", ")}`,
        );
      return {
        text: textSlice(`workspace:${file.path}`, file.content, input),
        details: { source: `workspace:${file.path}` },
      };
    }
    return readAttachment(run, source.id, input, signal);
  },
};

function readSkill(
  run: RunContext,
  name: string,
  path: string,
  input: Record<string, unknown>,
): ToolResult {
  // run.skills holds the resolved skills: a user's copy of a built-in
  // replaces it.
  const skill = findSkill(run.skills, name.trim());
  if (!skill)
    return fail(
      `No skill "${name}". Skills: ${run.skills.map((item) => item.name).join(", ") || "none"}.`,
    );
  const file = skill.files.find((item) => item.path === path);
  if (!file)
    return fail(
      `Skill ${skill.name} has no file "${path}". Files: ${skill.files.map((item) => item.path).join(", ")}`,
    );
  const others =
    path === SKILL_ENTRY_PATH && skill.files.length > 1
      ? `\n[Other files: ${skill.files
          .filter((item) => item !== file)
          .map((item) => `skill:${skill.name}/${item.path}`)
          .join(", ")}]`
      : "";
  // Read whole up to a higher limit than other sources; a cut says so at
  // the end, where the reader stops. A skill is instructions, not a source
  // to cite, so it adds none.
  const source = `skill:${skill.name}/${file.path}`;
  const max = tokenChars(CONTEXT_POLICY.skillReadMaxTokens);
  const { offset, end } = sliceRange(file.content, input, max);
  const total = file.content.length;
  const truncated = end < total;
  const note = truncated
    ? `\n[Truncated: showed characters ${offset}-${end} of ${total} of ${source}. The rest is not shown: continue with read source="${source}" offset=${end}.]`
    : "";
  return {
    text: `${textSlice(source, file.content, input, max)}${note}${others}`,
    details: {
      source,
      name: skill.name,
      chars: total,
      shown: end - offset,
      truncated,
    },
  };
}

async function readAttachment(
  run: RunContext,
  id: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const attachment: UploadedAttachment | undefined =
    run.attachments.find((item) => item.id === id) ||
    ((await readChatAttachment(id, signal)) as UploadedAttachment | undefined);
  if (!attachment)
    return fail(
      `No attachment "${id}". Use an id from available_attachments, written as attachment:ID.`,
    );
  const details = {
    source: `attachment:${attachment.id}`,
    name: attachment.name,
  };
  const sources = [{ kind: "file" as const, title: attachment.name }];
  if (
    attachment.kind === ATTACHMENT_KIND.text &&
    typeof attachment.text === "string"
  )
    return {
      text: textSlice(attachment.name, attachment.text, input),
      details,
      sources,
    };
  if (
    attachment.kind === ATTACHMENT_KIND.image &&
    attachment.dataUrl &&
    isVisionImageMimeType(attachment.type)
  )
    return {
      text: `Image ${attachment.name} attached.`,
      details,
      sources,
      image: { dataUrl: attachment.dataUrl, type: attachment.type },
    };
  if (!attachment.dataUrl)
    return fail(
      `${attachment.name} (${attachment.type || "unknown type"}) has no stored content.`,
      details,
    );
  const bytes = base64ToBytes(base64FromDataUrl(attachment.dataUrl));
  return binaryResult(attachment.name, bytes, input, details, sources);
}

// A binary file: its text when it is a document (PDF, Office,
// OpenDocument), or its bytes as base64 when asked for.
async function binaryResult(
  label: string,
  bytes: Uint8Array,
  input: Record<string, unknown>,
  details: Record<string, unknown>,
  sources: SourceInput[],
): Promise<ToolResult> {
  if (input.encoding === "base64")
    return {
      text: textSlice(`${label} as base64`, bytesToBase64(bytes), input),
      details: { ...details, encoding: "base64" },
    };
  const text = await documentText(bytes);
  if (text === undefined)
    return fail(
      `${label} (${bytes.length} bytes) has no text that can be extracted (only PDF, Word, Excel, PowerPoint and OpenDocument files do, and scanned pages have none). Read it with encoding "base64" to pass its bytes on.`,
      details,
    );
  return { text: textSlice(label, text, input), details, sources };
}

const TEXT_TYPE = /^text\/|json|xml|yaml|csv|markdown|javascript/;
const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)/;
// Fetched HTML with less text than this is likely a shell that needs
// JavaScript, a login or a bot check.
const THIN_PAGE_CHARS = 200;

// Sent with the browser's cookies for the site, as a tab's first request
// would be, so a page behind the user's login reads the same.
async function readUrl(
  url: string,
  input: Record<string, unknown>,
  run: RunContext,
  signal?: AbortSignal,
): Promise<ToolResult> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", signal });
  } catch (error) {
    signal?.throwIfAborted();
    return fail(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok)
    return fail(`Fetching ${url} failed with HTTP ${response.status}.`);
  const blob = await response.blob();
  const type = blob.type || "application/octet-stream";
  const details = { source: url, type, size: blob.size };
  if (HTML_TYPE.test(type))
    return readHtml(
      response.url || url,
      decodeHtml(
        new Uint8Array(await blob.arrayBuffer()),
        response.headers.get("content-type") || type,
      ),
      input,
      details,
      hasToolGroup(run.agent, "browser"),
    );
  if (
    TEXT_TYPE.test(type) ||
    (type === "application/octet-stream" &&
      /\.(txt|md|json|csv|xml|ya?ml)(\?|#|$)/i.test(url))
  )
    return {
      text: textSlice(url, await blob.text(), input),
      details,
      sources: [{ kind: "file", title: url, url }],
    };
  if (isVisionImageMimeType(type)) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      text: `Image ${url} attached.`,
      details,
      image: { dataUrl: `data:${type};base64,${bytesToBase64(bytes)}`, type },
    };
  }
  return binaryResult(
    url,
    new Uint8Array(await blob.arrayBuffer()),
    input,
    details,
    [{ kind: "file", title: url, url }],
  );
}

async function readHtml(
  url: string,
  html: string,
  input: Record<string, unknown>,
  details: Record<string, unknown>,
  canOpenTabs: boolean,
): Promise<ToolResult> {
  const page = await fetchedHtmlMarkdown(html, url);
  const title = page.title || url;
  // Link targets are not text a reader sees.
  const visible = page.text.replace(/\]\([^)]*\)/g, "]").replace(/\s+/g, "");
  const thin =
    visible.length < THIN_PAGE_CHARS
      ? `\n[Only ${visible.length} characters of text in the fetched HTML: the page may need JavaScript, a login or a bot check.${canOpenTabs ? " Open it with tabs (action open) to read it as the browser shows it." : ""}]`
      : "";
  return {
    text: `${textSlice(`${title} | ${url}`, page.text, input)}${thin}`,
    details: { ...details, title, chars: page.text.length },
    sources: [{ kind: "page", title, url }],
  };
}

// HTML in the charset its Content-Type or its first <meta> names.
function decodeHtml(bytes: Uint8Array, type: string) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset =
    type.match(/charset=["']?([\w-]+)/i)?.[1] ||
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
