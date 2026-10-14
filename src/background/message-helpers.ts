import {
  ATTACHMENT_CONTEXT_TAG,
  isMetadataOnlyAttachment,
} from "../shared/attachments";
import { renderSourcesForPrompt } from "../shared/chat-sources";
import { findSkill } from "../shared/skill-catalog";
import {
  getSkillBody,
  interpolateSkillVariables,
  pickedSkillsFromMetadata,
  SKILL_ENTRY_PATH,
} from "../shared/skills";
import type {
  ChatMessage,
  ChatSource,
  PickedSkill,
  Skill,
  UploadedAttachment,
} from "../shared/types";

// Earlier turns are replayed as plain text, noting the skills the user
// picked; the latest user message also carries its context: the picked
// skills' instructions, selected tabs and elements, attachments, and sources
// that can be cited again.
export function renderMessageText(
  message: ChatMessage,
  options: {
    latest: boolean;
    attachments: UploadedAttachment[];
    // The skills the run can use, to resolve picked ones.
    skills: Skill[];
  },
) {
  if (options.latest && message.role === "user")
    return renderLatestUserMessage(message, options);
  const picked = pickedSkillsFromMetadata(message.metadata)
    .map((skill) => `skill:${skill.name}`)
    .join(", ");
  return [
    picked && `[The user picked ${picked} for this message.]`,
    message.content,
    renderAttachmentContext(getUploadedAttachments(message)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderLatestUserMessage(
  message: ChatMessage,
  {
    attachments: requestAttachments,
    skills,
  }: { attachments: UploadedAttachment[]; skills: Skill[] },
) {
  if (message.metadata?.internalRetry)
    return `<internal_instruction>\n${message.content}\n</internal_instruction>`;
  const sources = Array.isArray(message.metadata?.sources)
    ? (message.metadata.sources as ChatSource[])
    : [];
  const context = [
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "",
    renderAttachmentContext(
      requestAttachments.length
        ? requestAttachments
        : getUploadedAttachments(message),
    ),
    renderSourcesForPrompt(sources),
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    ...pickedSkillsFromMetadata(message.metadata).map((picked) =>
      renderPickedSkill(picked, skills),
    ),
    context ? `<message_context>\n${context}\n</message_context>` : "",
    `<message>\n${message.content}\n</message>`,
    requestInstruction(message),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Requests made from the context menu or the smart bar say how to carry
// them out; the message shows only what the user picked.
function requestInstruction(message: ChatMessage) {
  const instruction = message.metadata?.instruction;
  return typeof instruction === "string" && instruction.trim()
    ? `<request_instructions>\n${instruction.trim()}\n</request_instructions>`
    : "";
}

// A picked skill means "use this skill for this request": its instructions
// come with the message instead of waiting for the model to read them.
function renderPickedSkill(picked: PickedSkill, skills: Skill[]) {
  const skill =
    findSkill(skills, picked.id) || findSkill(skills, picked.name || "");
  if (!skill)
    return `<skill name="${picked.name}">\nThe user picked this skill, but it is no longer available. Do the request without it.\n</skill>`;
  const others = skill.files
    .map((file) => file.path)
    .filter((path) => path !== SKILL_ENTRY_PATH);
  return `<skill name="${skill.name}">
The user picked this skill for this request: follow its instructions.${others.length ? ` Its other files, read with read "skill:${skill.name}/PATH" when it says so: ${others.join(", ")}.` : ""}

${interpolateSkillVariables(getSkillBody(skill))}
</skill>`;
}

export function getUploadedAttachments(message: ChatMessage) {
  return Array.isArray(message.metadata?.uploadedAttachments)
    ? (message.metadata.uploadedAttachments as UploadedAttachment[])
    : [];
}

function renderAttachmentContext(attachments: UploadedAttachment[]) {
  if (!attachments.length) return "";
  return `<${ATTACHMENT_CONTEXT_TAG}>\n${attachments
    .map(
      (attachment) =>
        `- attachment:${attachment.id} ${attachment.name} (${attachment.type || "unknown"}, ${attachment.size} bytes)${isMetadataOnlyAttachment(attachment.kind) ? " — binary; read with encoding base64 for its bytes" : ""}`,
    )
    .join("\n")}\n</${ATTACHMENT_CONTEXT_TAG}>`;
}
