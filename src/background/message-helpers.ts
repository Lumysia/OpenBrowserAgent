import { POST_TEXT_CHUNK_SIZE } from "../shared/config";
import {
  ATTACHMENT_CONTEXT_TAG,
  ATTACHMENT_KIND,
  ATTACHMENT_READ_NOTE,
} from "../shared/attachments";
import {
  AI_TEXT_CHUNK_TYPE,
  type AiStreamResponse,
  type ChatMessage,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { getSkillDisplayName, getSkillInstruction } from "../shared/skills";

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

function post(port: chrome.runtime.Port, message: AiStreamResponse) {
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
  const skill = message.metadata?.skill as Skill | undefined;
  const attachments = requestAttachments.length
    ? requestAttachments
    : getUploadedAttachments(message);
  return `${
    skill
      ? `<instruction>
${getSkillInstruction(skill)}
</instruction>

`
      : ""
  }<message_context>

${context}

${renderAttachmentContext(attachments)}

${renderSkillCatalog(availableSkills)}

</message_context>

<message>
${message.content}
</message>`;
}

export function renderSkillCatalog(skills: Skill[]) {
  if (!skills.length) return "";
  return `<available_skills>
${skills
  .map(
    (skill) =>
      `- id: ${skill.id}\n  name: ${getSkillDisplayName(skill)}\n  description: ${skill.description || ""}\n  entry: SKILL.md\n  supportingFiles: ${skill.readSkillFiles === false ? "hidden" : "readable"}\n  note: Use readSkill with this id to read SKILL.md if this skill is relevant.${skill.readSkillFiles === false ? " Supporting files are hidden." : " If SKILL.md lists supporting files, use readSkillFile with the path to read them."}`,
  )
  .join("\n\n")}
</available_skills>`;
}

export function getUploadedAttachments(message: ChatMessage) {
  return Array.isArray(message.metadata?.uploadedAttachments)
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
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
