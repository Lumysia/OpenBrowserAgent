import {
  ATTACHMENT_KIND,
  isVisionImageMimeType,
} from "../../shared/attachments";
import { bytesToBase64 } from "../../shared/binary";
import { hasToolGroup } from "../../shared/agents";
import { SKILL_ENTRY_PATH } from "../../shared/skills";
import { readSyncedChatAttachment } from "../../shared/sync-chat-attachments";
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
  type ToolDefinition,
  type ToolResult,
} from "./types";

// One character range of a longer text, with where to continue.
export function textSlice(
  label: string,
  text: string,
  input: Record<string, unknown>,
) {
  const total = text.length;
  const offset = Math.min(
    total,
    Math.max(0, Math.trunc(Number(input.offset) || 0)),
  );
  const max = tokenChars(CONTEXT_POLICY.readMaxTokens);
  const limit = Math.min(
    max,
    Math.max(1, Math.trunc(Number(input.limit) || max)),
  );
  const end = Math.min(total, offset + limit);
  const position = end < total ? `continue with offset=${end}` : "end";
  return `[${label} | characters ${offset}-${end} of ${total}; ${position}]\n${text.slice(offset, end)}`;
}

type Source =
  | { kind: "tab"; tabId?: number }
  | { kind: "artifact"; handle: string }
  | { kind: "url"; url: string }
  | { kind: "attachment"; id: string }
  | { kind: "skill"; name: string; path: string }
  | { kind: "workspace"; path: string };

function parseSource(value: string): Source {
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
  summary: "Read text in ranges",
  description:
    'Read one source in character ranges: "tab" or "tab:ID" (page text as Markdown; default: active tab), a stored output handle "art-…", a URL, "attachment:ID", "skill:NAME" or "skill:NAME/PATH", "workspace:PATH". Continue with the offset it reports. Images come back as images.',
  parameters: schema({
    source: { type: "string", description: 'What to read. Defaults to "tab".' },
    offset: { type: "number" },
    limit: { type: "number", description: "Characters to return." },
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
    if (source.kind === "url") return readUrl(source.url, input, signal);
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
  const wanted = name.trim().toLowerCase();
  const skill = run.skills.find(
    (item) => item.name.toLowerCase() === wanted || item.id === name,
  );
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
  return {
    text: `${textSlice(`skill:${skill.name}/${file.path}`, file.content, input)}${others}`,
    details: { source: `skill:${skill.name}/${file.path}`, name: skill.name },
    sources: [{ kind: "skill", title: `${skill.name} / ${file.path}` }],
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
    ((await readSyncedChatAttachment(undefined, id, signal)) as
      UploadedAttachment | undefined);
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
  return fail(
    `${attachment.name} (${attachment.type || "unknown type"}, ${attachment.size} bytes) is not text, so it cannot be read here. Ask the user for a text export if its content matters.`,
    details,
  );
}

const TEXT_TYPE = /^text\/|json|xml|yaml|csv|markdown|javascript/;

async function readUrl(
  url: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
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
  if (type.startsWith("text/html"))
    return fail(
      `${url} is a web page. Open it with tabs (action open) and use snapshot or read "tab:ID".`,
      details,
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
  return fail(
    `${url} is ${type} (${blob.size} bytes), which cannot be read as text.`,
    details,
  );
}
