import { ATTACHMENT_KIND, base64FromDataUrl } from "../../shared/attachments";
import { base64ToBytes } from "../../shared/binary";
import { readChatAttachment } from "../../shared/chat-attachments";
import { MARKDOWN_FILENAME_MAX_LENGTH } from "../../shared/config";
import type { UploadedAttachment } from "../../shared/types";
import { callPage, pageTab } from "../page-agent";
import { parseSource, SAVE_SOURCES_HELP } from "../tools/source-handles";
import type { RunContext } from "../tools/types";
import { typeForName } from "../../shared/mime";
import { baseName, safeSegment, withExtension } from "./filenames";

// Files made from what the agent has: text or bytes it writes, or a source
// in the read tool's terms. Errors are messages for the model.

export type FileContent = { blob: Blob; name: string };

const DEFAULT_TYPE = "text/plain";
// Excel reads a CSV without a byte order mark in the system's legacy code
// page, which garbles anything outside ASCII.
const BOM_TYPES = /^text\/(csv|tab-separated-values)/;
const DATA_URL = /^data:([^;,]*)(;[^,]*)?,/;

export class ContentError extends Error {}

export function fileFromContent(options: {
  content: string;
  filename?: string;
  mimeType?: string;
  encoding?: string;
}): FileContent {
  const { content } = options;
  const dataUrl = content.match(DATA_URL);
  const filename = options.filename?.trim() || "";
  const type =
    options.mimeType?.trim() ||
    typeForName(filename) ||
    dataUrl?.[1] ||
    DEFAULT_TYPE;
  const name = withExtension(baseName(filename) || "download", type);
  let bytes: BlobPart;
  if (dataUrl || options.encoding === "base64") {
    try {
      bytes = base64ToBytes(
        (dataUrl ? base64FromDataUrl(content) : content).replace(/\s+/g, ""),
      ) as Uint8Array<ArrayBuffer>;
    } catch {
      throw new ContentError(
        'content is not valid base64. Pass text with encoding "text", or base64 bytes.',
      );
    }
  } else {
    bytes =
      BOM_TYPES.test(type) && /[^\x00-\x7f]/.test(content)
        ? `\ufeff${content}`
        : content;
  }
  return { blob: new Blob([bytes], { type }), name };
}

function attachmentFile(attachment: UploadedAttachment): FileContent {
  const name = safeSegment(attachment.name) || "attachment";
  const type = attachment.type || typeForName(name) || DEFAULT_TYPE;
  if (attachment.dataUrl)
    return {
      blob: new Blob(
        [
          base64ToBytes(
            base64FromDataUrl(attachment.dataUrl),
          ) as Uint8Array<ArrayBuffer>,
        ],
        { type },
      ),
      name,
    };
  if (
    attachment.kind === ATTACHMENT_KIND.text &&
    typeof attachment.text === "string"
  )
    return { blob: new Blob([attachment.text], { type }), name };
  throw new ContentError(
    `${attachment.name} has no stored content on this device.`,
  );
}

// A file from a source the read tool names (SAVE_SOURCES_HELP).
export async function fileFromSource(
  run: RunContext,
  value: string,
  signal?: AbortSignal,
): Promise<FileContent> {
  const source = parseSource(value);
  if (source.kind === "tab") {
    const tab = await pageTab(run.tab, source.tabId);
    const {
      value: page,
      title,
      url,
    } = await callPage<{ text: string }>(tab.id, "markdown", {}, signal);
    const label = safeSegment(title || url || "tab").slice(
      0,
      MARKDOWN_FILENAME_MAX_LENGTH,
    );
    return {
      blob: new Blob([`# ${title}\n\nURL: ${url}\n\n${page.text}`], {
        type: "text/markdown",
      }),
      name: `${label.trim() || "tab"}.md`,
    };
  }
  if (source.kind === "artifact") {
    const artifact = await run.readArtifact(source.handle);
    if (!artifact)
      throw new ContentError(
        `No stored output "${source.handle}" in this chat.`,
      );
    return {
      blob: new Blob([artifact.text], { type: DEFAULT_TYPE }),
      name: `${source.handle}.txt`,
    };
  }
  if (source.kind === "workspace") {
    if (!run.workspace) throw new ContentError("This agent has no workspace.");
    const file = run.workspace.files.find((item) => item.path === source.path);
    if (!file)
      throw new ContentError(
        `No workspace file "${source.path}". Files: ${run.workspace.files.map((item) => item.path).join(", ")}`,
      );
    const name = safeSegment(baseName(file.path)) || "workspace.md";
    return {
      blob: new Blob([file.content], {
        type: typeForName(name) || DEFAULT_TYPE,
      }),
      name,
    };
  }
  if (source.kind === "attachment") {
    const attachment =
      run.attachments.find((item) => item.id === source.id) ||
      ((await readChatAttachment(source.id, signal)) as
        UploadedAttachment | undefined);
    if (!attachment)
      throw new ContentError(
        `No attachment "${source.id}". Use an id from available_attachments or a generated image, written as attachment:ID.`,
      );
    return attachmentFile(attachment);
  }
  throw new ContentError(
    source.kind === "url"
      ? "To save a file from a URL, use the download action."
      : `Cannot save "${value}" as a file. Use ${SAVE_SOURCES_HELP}, or pass content.`,
  );
}
