import { POST_TEXT_CHUNK_SIZE, STREAM_CHUNK_DELAY_MS } from "../shared/config";
import {
  ATTACHMENT_CONTEXT_TAG,
  ATTACHMENT_KIND,
  ATTACHMENT_READ_NOTE,
} from "../shared/attachments";
import {
  AI_TEXT_CHUNK_TYPE,
  type AiStreamResponse,
  type ChatMessage,
  type ChatSource,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { getSkillInstruction } from "../shared/skills";
import { renderSourcesForPrompt } from "../shared/chat-sources";

export function postText(
  port: chrome.runtime.Port,
  text: string,
  id: string,
  signal: AbortSignal,
  appendToMessageContent = true,
) {
  const chunkType = appendToMessageContent
    ? {
        start: AI_TEXT_CHUNK_TYPE.textStart,
        delta: AI_TEXT_CHUNK_TYPE.textDelta,
        end: AI_TEXT_CHUNK_TYPE.textEnd,
      }
    : {
        start: AI_TEXT_CHUNK_TYPE.textNoteStart,
        delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
        end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
      };
  post(port, { type: "chunk", chunk: { type: chunkType.start, id } });
  for (const delta of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    post(port, {
      type: "chunk",
      chunk: { type: chunkType.delta, id, delta },
    });
  }
  post(port, { type: "chunk", chunk: { type: chunkType.end, id } });
}

export async function postTextStream(
  port: chrome.runtime.Port,
  text: string,
  id: string,
  signal: AbortSignal,
  appendToMessageContent = true,
) {
  const chunkType = appendToMessageContent
    ? {
        start: AI_TEXT_CHUNK_TYPE.textStart,
        delta: AI_TEXT_CHUNK_TYPE.textDelta,
        end: AI_TEXT_CHUNK_TYPE.textEnd,
      }
    : {
        start: AI_TEXT_CHUNK_TYPE.textNoteStart,
        delta: AI_TEXT_CHUNK_TYPE.textNoteDelta,
        end: AI_TEXT_CHUNK_TYPE.textNoteEnd,
      };
  post(port, { type: "chunk", chunk: { type: chunkType.start, id } });
  for (const delta of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    post(port, {
      type: "chunk",
      chunk: { type: chunkType.delta, id, delta },
    });
    await new Promise((resolve) => setTimeout(resolve, STREAM_CHUNK_DELAY_MS));
  }
  post(port, { type: "chunk", chunk: { type: chunkType.end, id } });
}

export function post(port: chrome.runtime.Port, message: AiStreamResponse) {
  try {
    port.postMessage(message);
  } catch (error) {
    console.warn("Failed to post ai-stream message", error);
  }
}

export function chunkText(text: string) {
  const chunks: string[] = [];
  const codePoints = Array.from(text);
  for (let index = 0; index < codePoints.length; index += POST_TEXT_CHUNK_SIZE)
    chunks.push(codePoints.slice(index, index + POST_TEXT_CHUNK_SIZE).join(""));
  return chunks;
}

export function parseToolArgs(value: string | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function renderUserMessageWithContext(
  message: ChatMessage,
  requestAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
) {
  if (message.metadata?.internalRetry) {
    return `<internal_instruction>
${message.content}
</internal_instruction>`;
  }

  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const skills = messageSkills(message.metadata);
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  return `${
    skills.length
      ? `<instruction>
${skills.map((skill) => getSkillInstruction(skill)).join("\n\n")}
</instruction>

`
      : ""
  }<message_context>

${context}

${renderAttachmentContext(attachments)}

${renderSkillToolHint(availableSkills)}

${renderSourcesForPrompt(getMessageSources(message))}

</message_context>

<message>
${message.content}
</message>`;
}

function messageSkills(metadata: Record<string, unknown> | undefined) {
  const skills = Array.isArray(metadata?.skills)
    ? (metadata.skills as Skill[])
    : [];
  const skill = metadata?.skill as Skill | undefined;
  return skills.length ? skills : skill ? [skill] : [];
}

export function renderSkillToolHint(skills: Skill[]) {
  if (!skills.length) return "";
  return `<skill_tools>
For browser automation, search, or research tasks, call readSkill with skillId "builtin-browser-guidance" before acting. For other specialized workflows, call listSkills first. Use patchSkillFile or updateSkillFile only for broadly reusable improvements; never store secrets or one-off task details.
</skill_tools>`;
}

export function getUploadedAttachments(message: ChatMessage) {
  return Array.isArray(message.metadata?.uploadedAttachments)
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
    : [];
}

function getMessageSources(message: ChatMessage): ChatSource[] {
  return Array.isArray(message.metadata?.sources)
    ? (message.metadata.sources as ChatSource[])
    : [];
}

export function renderAttachmentContext(attachments: UploadedAttachment[]) {
  if (!attachments.length) return "";
  return `<${ATTACHMENT_CONTEXT_TAG}>
${attachments
  .map((attachment) => {
    const header = `- id: ${attachment.id}\n  name: ${attachment.name}\n  type: ${attachment.type || "unknown"}\n  size: ${attachment.size} bytes\n  kind: ${attachment.kind}`;
    if (attachment.kind === ATTACHMENT_KIND.text && attachment.text)
      return `${header}\n  note: ${ATTACHMENT_READ_NOTE.text}`;
    if (attachment.kind === ATTACHMENT_KIND.image)
      return `${header}\n  note: ${ATTACHMENT_READ_NOTE.image}`;
    if (
      attachment.kind === ATTACHMENT_KIND.audio ||
      attachment.kind === ATTACHMENT_KIND.video
    )
      return `${header}\n  note: ${ATTACHMENT_READ_NOTE.media}`;
    if (attachment.kind === ATTACHMENT_KIND.document)
      return `${header}\n  note: ${ATTACHMENT_READ_NOTE.document}`;
    return `${header}\n  note: ${ATTACHMENT_READ_NOTE.binary}`;
  })
  .join("\n\n")}
</${ATTACHMENT_CONTEXT_TAG}>`;
}
