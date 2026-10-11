import { getSkillInstruction } from "../shared/skills";
import {
  PROMPT_CONTEXT_TAG,
  PROMPT_CONTEXT_TAGS,
} from "../shared/prompt-breakdown";
import {
  isToolPartType,
  type ChatPart,
  type PromptBreakdown,
  type SendMessagesRequest,
  type Skill,
} from "../shared/types";
import { browserToolsForPrompt } from "./tool-prompt-selection";

// Approximate prompt size by source, shown in the run info panel.
export function promptBreakdown(
  system: string,
  request: SendMessagesRequest,
  hasWorkspace: boolean,
): PromptBreakdown {
  const latestUser = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  const attachments = request.body.context?.uploadedAttachments || [];
  const context = request.body.context?.text || "";
  const attachedTabs = latestUser?.metadata?.attachedTabs;
  const selectedElements = latestUser?.metadata?.selectedElements;
  const selectedSkills = messageSkills(latestUser?.metadata);
  const availableSkills = request.body.context?.availableSkills || [];
  return {
    systemPromptChars:
      system.length +
      jsonLength(
        browserToolsForPrompt({
          capabilities: request.body.agentCapabilities,
          hasSkills: availableSkills.length > 0,
          hasWorkspace,
          imageGenerationEnabled:
            !!request.body.context?.imageGenerationEnabled,
          latestUserText: latestUser?.content || "",
        }),
      ),
    userPromptChars: latestUser?.content.length || 0,
    conversationPromptChars: request.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
    tabPromptChars:
      contextBlockLength(context, PROMPT_CONTEXT_TAG.selectedTabs) +
      contextBlockLength(context, PROMPT_CONTEXT_TAG.currentTab) +
      jsonLength(attachedTabs),
    selectedElementPromptChars:
      contextBlockLength(context, PROMPT_CONTEXT_TAG.selectedElement) +
      jsonLength(selectedElements),
    skillPromptChars:
      selectedSkills.reduce(
        (total, skill) => total + getSkillInstruction(skill).length,
        0,
      ) +
      availableSkills.reduce(
        (total, item) => total + item.name.length + item.description.length,
        0,
      ),
    attachmentPromptChars: attachments.reduce(
      (total, attachment) =>
        total +
        attachment.name.length +
        (attachment.text?.length || 0) +
        (attachment.dataUrl?.length || 0),
      0,
    ),
    toolCallPromptChars: request.messages.reduce(
      (total, message) => total + toolCallChars(message.parts),
      0,
    ),
    sourcePromptChars: request.messages.reduce(
      (total, message) => total + jsonLength(message.metadata?.sources),
      0,
    ),
    otherContextPromptChars: otherContextChars(context),
  };
}

function messageSkills(metadata: Record<string, unknown> | undefined) {
  return Array.isArray(metadata?.skills) ? (metadata.skills as Skill[]) : [];
}

function contextBlockLength(context: string, tag: string) {
  const match = context.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "g"));
  return match?.reduce((total, value) => total + value.length, 0) || 0;
}

function otherContextChars(context: string) {
  const known = PROMPT_CONTEXT_TAGS.reduce(
    (total, tag) => total + contextBlockLength(context, tag),
    0,
  );
  return Math.max(0, context.length - known);
}

function toolCallChars(parts: ChatPart[] | undefined) {
  if (!parts?.length) return 0;
  return parts.reduce((total, part) => {
    if (!isToolPartType(part.type)) return total;
    return (
      total +
      jsonLength(part.input) +
      jsonLength(part.output) +
      (part.toolName?.length || 0)
    );
  }, 0);
}

function jsonLength(value: unknown) {
  if (!value) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}
