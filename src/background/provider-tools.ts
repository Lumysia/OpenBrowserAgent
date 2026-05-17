import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import {
  isAskMode,
  type ChatMode,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { readSkill, readUploadedAttachment } from "./attachment-messages";
import { browserTools, safeExecuteBrowserTool } from "./tools";

export function toolsForMode(
  mode: ChatMode,
  hasUploadedAttachments: boolean,
  hasSkills: boolean,
) {
  return browserTools.filter((item) => {
    const name = item.function.name;
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return hasUploadedAttachments;
    if (name === BROWSER_TOOL_NAME.readSkill) return hasSkills;
    return !isAskMode(mode);
  });
}

export function executeContextAwareTool({
  toolName,
  input,
  uploadedAttachments,
  availableSkills,
}: {
  toolName: string;
  input: Record<string, unknown>;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
}) {
  if (toolName === BROWSER_TOOL_NAME.readUploadedAttachment)
    return readUploadedAttachment(uploadedAttachments, input);
  if (toolName === BROWSER_TOOL_NAME.readSkill)
    return readSkill(availableSkills, input);
  return safeExecuteBrowserTool(toolName, input);
}
