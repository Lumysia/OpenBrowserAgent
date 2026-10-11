import {
  ATTACHMENT_CONTEXT_TAG,
  ATTACHMENT_KIND,
  ATTACHMENT_READ_NOTE,
} from "../shared/attachments";
import {
  type AgentWorkspace,
  type ChatMessage,
  type ChatSource,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { getSkillInstruction } from "../shared/skills";
import { renderSourcesForPrompt } from "../shared/chat-sources";
import { renderWorkspaceManifest } from "../shared/workspace";

export function renderUserMessageWithContext(
  message: ChatMessage,
  requestAttachments: UploadedAttachment[] = [],
  availableSkills: Skill[] = [],
  workspace?: AgentWorkspace,
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

${renderWorkspaceToolHint(workspace)}

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
For browser automation, search, or research tasks, load manageSkills if needed, then call manageSkills with operation="read" and skillId="builtin-browser-guidance" before acting. For other specialized workflows, call manageSkills with operation="list" first. Use manageSkills create/updateFile/patchFile only for broadly reusable improvements; never store secrets or one-off task details.
</skill_tools>`;
}

export function renderWorkspaceToolHint(workspace: AgentWorkspace | undefined) {
  const manifest = renderWorkspaceManifest(workspace);
  if (!manifest) return "";
  return `${manifest}
<workspace_tools>
Use workspace tools to read, search, update, or delete these private agent files when they are relevant. Store stable task notes or agent state here, not secrets.
</workspace_tools>`;
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
