import {
  CHAT_PART_STATE,
  toolPartType,
  type AgentCapabilities,
  type AgentWorkspace,
  type ChatSource,
  type Preferences,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { post } from "./message-helpers";
import {
  attachToolSources,
  extractVisionImage,
  mergeOutputSources,
  sanitizeToolOutput,
  type VisionImage,
} from "./provider-output";
import { executeContextAwareTool } from "./provider-tools";
import { isToolError } from "./tool-utils";

export type ProviderToolRunResult = {
  output: unknown;
  visionImage?: VisionImage;
  responseSources: ChatSource[];
};

export async function runProviderTool({
  toolName,
  toolCallId,
  input,
  port,
  chatId,
  messageId,
  uploadedAttachments,
  availableSkills,
  preferences,
  capabilities,
  workspace,
  responseSources,
  loadedToolNames,
  availableTools,
}: {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  port: chrome.runtime.Port;
  chatId?: string;
  messageId?: string;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  preferences: Preferences;
  capabilities: AgentCapabilities;
  workspace?: AgentWorkspace;
  responseSources: ChatSource[];
  loadedToolNames: Set<string>;
  availableTools: Array<{ function: { name: string } }>;
}): Promise<ProviderToolRunResult> {
  post(port, {
    type: "chunk",
    chunk: {
      type: toolPartType(toolName),
      toolCallId,
      toolName,
      state: CHAT_PART_STATE.inputAvailable,
      input,
    },
  });
  const rawOutput = isAvailableTool(toolName, availableTools)
    ? await executeContextAwareTool({
        toolName,
        input,
        context: { chatId, messageId, toolCallId },
        uploadedAttachments,
        availableSkills,
        capabilities,
        workspace,
      })
    : {
        success: false,
        error: `Tool "${toolName}" is not available to the active agent.`,
      };
  loadDeferredToolNames(rawOutput, loadedToolNames);
  const visionImage = extractVisionImage(rawOutput);
  const output = attachToolSources(
    toolName,
    input,
    sanitizeToolOutput(rawOutput),
    responseSources,
  );
  const nextSources = mergeOutputSources(responseSources, output);
  post(port, {
    type: "chunk",
    chunk: {
      type: toolPartType(toolName),
      toolCallId,
      toolName,
      state: isToolError(output)
        ? CHAT_PART_STATE.outputError
        : CHAT_PART_STATE.outputAvailable,
      input,
      output,
    },
  });
  return { output, visionImage, responseSources: nextSources };
}

function isAvailableTool(
  toolName: string,
  availableTools: Array<{ function: { name: string } }>,
) {
  return availableTools.some((tool) => tool.function.name === toolName);
}

function loadDeferredToolNames(output: unknown, loadedToolNames: Set<string>) {
  const names =
    output && typeof output === "object" && "loadedToolNames" in output
      ? (output as { loadedToolNames?: unknown }).loadedToolNames
      : undefined;
  if (!Array.isArray(names)) return;
  names
    .map(String)
    .filter(Boolean)
    .forEach((name) => loadedToolNames.add(name));
}
