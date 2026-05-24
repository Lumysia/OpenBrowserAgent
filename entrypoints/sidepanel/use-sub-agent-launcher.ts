import { useCallback, useRef } from "react";
import { resolveAgent } from "../../src/shared/agents";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import { DEFAULT_MAX_TOOL_STEPS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { isSkillEnabled } from "../../src/shared/skills";
import {
  AI_STREAM_REQUEST_TYPE,
  CHAT_PART_STATE,
  toolPartType,
  type Agent,
  type Chat,
  type ChatMessage,
  type ModelConfig,
  type Preferences,
  type SendMessagesRequest,
  type Skill,
} from "../../src/shared/types";
import { localizedAgentTitle } from "../../src/ui/agent-display";
import { pruneEmptyChats } from "./chat-state-actions";
import { assistantModelLabel } from "./model-label";
import { agentWithoutNestedSubAgents } from "./sub-agent-runtime";

type SubAgentStreamEvent = {
  chatId: string;
  messageId: string;
  chunk: unknown;
};

export type SubAgentHandler = (event: SubAgentStreamEvent) => void;

export function useSubAgentLauncher({
  chats,
  agents,
  preferences,
  configuredModels,
  skills,
  language,
  t,
  setChats,
  beginStream,
  startStream,
}: {
  chats: Chat[] | undefined;
  agents: Agent[] | undefined;
  preferences: Preferences | undefined;
  configuredModels: ModelConfig[];
  skills: Skill[] | undefined;
  language: string | undefined;
  t: Messages;
  setChats: (
    value: Chat[] | ((previous: Chat[]) => Chat[]),
    options?: { persist?: "debounced" | "immediate" },
  ) => Promise<Chat[] | undefined>;
  beginStream: (chatId: string, messageId: string) => void;
  startStream: (request: SendMessagesRequest, targetMessageId: string) => void;
}) {
  const launchedSubAgentChatIdsRef = useRef<Set<string>>(new Set());

  return useCallback<SubAgentHandler>(
    ({ chatId, messageId, chunk }: SubAgentStreamEvent) => {
      const output = subAgentToolOutput(chunk);
      if (
        !output?.childChatId ||
        launchedSubAgentChatIdsRef.current.has(output.childChatId)
      )
        return;
      if (chats?.some((chat) => chat.id === output.childChatId)) {
        launchedSubAgentChatIdsRef.current.add(output.childChatId);
        return;
      }
      const childAgent = agentWithoutNestedSubAgents(
        resolveAgent(agents, output.agentId),
      );
      const now = Date.now();
      const title = localizedAgentTitle({
        title: output.title,
        agentId: childAgent.id,
        agentName: childAgent.name,
        fallback: output.task || t.sidepanel.subAgentChat,
        t,
      });
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: output.task,
        createdAt: now,
        metadata: {
          subAgent: true,
          parentChatId: chatId,
          parentMessageId: messageId,
          parentToolCallId: output.parentToolCallId,
        },
      };
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        parts: [],
        createdAt: now,
        metadata: {
          assistantModel: assistantModelLabel({
            modelId: preferences?.selectedModelId,
            models: configuredModels,
          }),
          runMetrics: { startedAt: now },
        },
      };
      const childChat: Chat = {
        id: output.childChatId,
        title,
        agentId: childAgent.id,
        kind: "subagent",
        parentChatId: chatId,
        parentMessageId: messageId,
        parentToolCallId: output.parentToolCallId,
        messages: [userMessage, assistantMessage],
        createdAt: now,
        updatedAt: now,
      };
      launchedSubAgentChatIdsRef.current.add(childChat.id);
      setChats(
        (items) => {
          const withChild = items.some((chat) => chat.id === childChat.id)
            ? items
            : [...pruneEmptyChats(items), childChat];
          return withChild.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  childChatIds: Array.from(
                    new Set([...(chat.childChatIds || []), childChat.id]),
                  ),
                  updatedAt: Date.now(),
                }
              : chat,
          );
        },
        { persist: "immediate" },
      ).catch((error) => {
        console.warn("Failed to persist initial sub-agent chat", error);
      });
      const availableSkills = childAgent.capabilities.skillTools
        ? (skills || []).filter(isSkillEnabled)
        : [];
      const request: SendMessagesRequest = {
        type: AI_STREAM_REQUEST_TYPE.sendMessages,
        chatId: childChat.id,
        messageId: assistantMessage.id,
        trigger: BROWSER_TOOL_NAME.startSubAgent,
        messages: [userMessage],
        body: {
          modelId: preferences?.selectedModelId,
          agentCapabilities: childAgent.capabilities,
          language,
          maxToolSteps: preferences?.maxToolSteps ?? DEFAULT_MAX_TOOL_STEPS,
          context: {
            tabs: [],
            selectedElements: [],
            text: "",
            uploadedAttachments: [],
            availableSkills,
            sources: [],
            agent: childAgent,
            imageGenerationEnabled: preferences?.imageGenerationEnabled,
          },
        },
      };
      beginStream(childChat.id, assistantMessage.id);
      startStream(request, assistantMessage.id);
    },
    [
      agents,
      beginStream,
      chats,
      configuredModels,
      language,
      preferences,
      setChats,
      skills,
      startStream,
      t,
    ],
  );
}

function subAgentToolOutput(chunk: unknown) {
  if (!chunk || typeof chunk !== "object") return undefined;
  const maybe = chunk as {
    type?: string;
    state?: string;
    output?: unknown;
  };
  if (
    maybe.type !== toolPartType(BROWSER_TOOL_NAME.startSubAgent) ||
    maybe.state !== CHAT_PART_STATE.outputAvailable ||
    !maybe.output ||
    typeof maybe.output !== "object"
  )
    return undefined;
  const output = maybe.output as Record<string, unknown>;
  const childChatId = String(output.childChatId || "").trim();
  const task = String(output.task || "").trim();
  if (!childChatId || !task) return undefined;
  return {
    childChatId,
    task,
    agentId: String(output.agentId || "").trim() || undefined,
    parentToolCallId: String(output.parentToolCallId || "").trim() || undefined,
    title: String(output.title || "").trim() || undefined,
  };
}
