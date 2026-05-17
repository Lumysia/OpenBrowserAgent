import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { Messages } from "../../src/shared/i18n";
import {
  CHAT_PART_STATE,
  isToolPartType,
  type Chat,
  type ChatPart,
} from "../../src/shared/types";

export function aiWorkingStatus({
  chat,
  creatingSkill,
  t,
}: {
  chat?: Chat;
  creatingSkill: boolean;
  t: Messages;
}) {
  if (creatingSkill)
    return {
      title: t.sidepanel.generatingSkill,
      description: t.sidepanel.aiWorkingDescription,
    };
  const latestTool = latestToolPart(chat);
  if (latestTool && latestTool.state !== CHAT_PART_STATE.outputAvailable)
    return {
      title: toolRunningTitle(latestTool, t),
      description: t.sidepanel.aiWorkingDescription,
    };
  if (isPreparingFinalReply(chat, latestTool))
    return {
      title: t.sidepanel.preparingFinalReply,
      description: t.sidepanel.preparingFinalReplyDescription,
    };
  return {
    title: t.sidepanel.aiWorking,
    description: t.sidepanel.aiWorkingDescription,
  };
}

function latestToolPart(chat?: Chat) {
  const assistant = latestAssistant(chat);
  return [...(assistant?.parts || [])]
    .reverse()
    .find((part) => isToolPartType(part.type));
}

function isPreparingFinalReply(chat?: Chat, latestTool?: ChatPart) {
  if (!latestTool || latestTool.state !== CHAT_PART_STATE.outputAvailable)
    return false;
  const assistant = [...(chat?.messages || [])]
    .reverse()
    .find((message) => message.role === "assistant");
  const parts = assistant?.parts || [];
  const lastToolIndex = parts.findLastIndex(
    (part) => part.id === latestTool.id,
  );
  if (lastToolIndex === -1) return false;
  return !parts
    .slice(lastToolIndex + 1)
    .some((part) => part.type === "text" && !!part.text?.trim());
}

function latestAssistant(chat?: Chat) {
  return [...(chat?.messages || [])]
    .reverse()
    .find((message) => message.role === "assistant");
}

function toolRunningTitle(part: ChatPart, t: Messages) {
  const name = part.toolName || BROWSER_TOOL_NAME.getCurrentTab;
  const tool = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  return tool?.running || t.sidepanel.operatingBrowser;
}
