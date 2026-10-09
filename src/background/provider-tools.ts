import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { resolveAgent } from "../shared/agents";
import { isVisionImageMimeType } from "../shared/attachments";
import { areCdpToolsAvailable } from "../shared/runtime-capabilities";
import {
  BINARY_STRING_CHUNK_SIZE,
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_FILE_MAX_LIMIT,
} from "../shared/config";
import { storage } from "../shared/storage";
import {
  type AgentCapabilities,
  type AgentWorkspace,
  type Preferences,
  type McpServerConfig,
  type Skill,
  type UploadedAttachment,
} from "../shared/types";
import { readUploadedAttachment } from "./attachment-messages";
import { manageSkills } from "./skill-tools";
import { generateImage } from "./image-generation";
import {
  getLocalExecutionBridgeStatus,
  startLocalExecutionBridge,
  cancelLocalExecutionBridge,
  manageLocalExecutionBridges,
} from "./local-execution-bridge-tools";
import { manageMemory } from "./memory-tools";
import {
  executeMcpTool,
  isMcpToolName,
  manageMcpServers,
  mcpToolsForPrompt,
} from "./mcp-tools";
import { manageChatHistory } from "./session-tools";
import { safeExecuteBrowserTool } from "./tools";
import { browserToolsForPrompt } from "./tool-schema";
import { loadTools } from "./provider-tool-loader";
import { workspaceFiles } from "./workspace-tools";

export function toolsForCapabilities(
  capabilities: AgentCapabilities,
  hasSkills: boolean,
  imageGenerationEnabled: boolean,
  latestUserText = "",
  loadedToolNames: string[] = [],
  mcpServers: McpServerConfig[] = [],
  workspace?: AgentWorkspace,
) {
  return [
    ...browserToolsForPrompt({
      capabilities,
      hasSkills,
      hasWorkspace: !!workspace,
      imageGenerationEnabled,
      latestUserText,
      loadedToolNames,
    }),
    ...mcpToolsForPrompt(capabilities, mcpServers),
  ];
}

export function createToolResolver({
  capabilities,
  uploadedAttachments,
  availableSkills,
  preferences,
  latestUserText,
  mcpServers = [],
  workspace,
}: {
  capabilities: AgentCapabilities;
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  preferences: Preferences;
  latestUserText: string;
  mcpServers?: McpServerConfig[];
  workspace?: AgentWorkspace;
}) {
  const loadedToolNames = new Set<string>();
  return {
    loadedToolNames,
    availableTools: () =>
      toolsForCapabilities(
        capabilities,
        availableSkills.length > 0,
        !!preferences.imageGenerationEnabled,
        latestUserText,
        [...loadedToolNames],
        mcpServers,
        workspace,
      ),
  };
}

export function executeContextAwareTool({
  toolName,
  input,
  context,
  uploadedAttachments,
  availableSkills,
  capabilities,
  workspace,
  signal,
}: {
  toolName: string;
  input: Record<string, unknown>;
  context?: { chatId?: string; messageId?: string; toolCallId?: string };
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  capabilities: AgentCapabilities;
  workspace?: AgentWorkspace;
  signal?: AbortSignal;
}) {
  if (toolName === BROWSER_TOOL_NAME.loadTools)
    return loadTools(input, capabilities, {
      hasSkills: availableSkills.length > 0,
      hasWorkspace: !!workspace,
      cdpToolsAvailable: areCdpToolsAvailable(),
    });
  if (toolName === BROWSER_TOOL_NAME.startSubAgent)
    return startSubAgent(input, context);
  if (toolName === BROWSER_TOOL_NAME.getSubAgentStatus)
    return getSubAgentStatus(input);
  if (toolName === BROWSER_TOOL_NAME.startLocalExecutionBridge)
    return startLocalExecutionBridge(input, context, workspace);
  if (toolName === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus)
    return getLocalExecutionBridgeStatus(input);
  if (toolName === BROWSER_TOOL_NAME.cancelLocalExecutionBridge)
    return cancelLocalExecutionBridge(input);
  if (toolName === BROWSER_TOOL_NAME.manageLocalExecutionBridges)
    return manageLocalExecutionBridges(input);
  if (
    toolName === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript &&
    !capabilities.javascriptExecution
  )
    return {
      success: false,
      error: "Page JavaScript execution is disabled for the active agent",
    };
  if (toolName === BROWSER_TOOL_NAME.readUploadedAttachment)
    return readUploadedAttachment(uploadedAttachments, input);
  if (toolName === BROWSER_TOOL_NAME.manageSkills)
    return manageSkills(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.workspaceFiles)
    return workspaceFiles(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.manageMemory)
    return manageMemory(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.manageChatHistory)
    return manageChatHistory(input);
  if (toolName === BROWSER_TOOL_NAME.manageMcpServers)
    return manageMcpServers(input);
  if (isMcpToolName(toolName)) return executeMcpTool(toolName, input, signal);
  if (toolName === BROWSER_TOOL_NAME.generateImage)
    return generateImage(uploadedAttachments, input, context);
  if (toolName === BROWSER_TOOL_NAME.readFileFromUrl)
    return readFileFromUrl(input);
  return safeExecuteBrowserTool(toolName, input);
}

async function startSubAgent(
  input: Record<string, unknown>,
  context?: { chatId?: string; messageId?: string; toolCallId?: string },
) {
  const task = String(input.task || "").trim();
  if (!task) return { error: "Missing sub-agent task" };
  const agents = await storage.agents.get();
  const requestedAgentId = String(input.agentId || "").trim();
  const requestedAgentName = String(input.agentName || "").trim();
  const namedAgent = requestedAgentName
    ? agents.find(
        (item) =>
          item.name.trim().toLowerCase() === requestedAgentName.toLowerCase(),
      )
    : undefined;
  const agent =
    namedAgent || resolveAgent(agents, requestedAgentId || undefined);
  const title = normalizeSubAgentTitle(input.title, task, agent.name);
  const childChatId = crypto.randomUUID();
  return {
    taskId: childChatId,
    childChatId,
    state: "running",
    parentChatId: context?.chatId,
    parentMessageId: context?.messageId,
    parentToolCallId: context?.toolCallId,
    agentId: agent.id,
    agentName: agent.name,
    task,
    title,
    note:
      input.background === true
        ? "Sub-agent started in a linked child chat. Call getSubAgentStatus with taskId and wait=true when you need the result before answering."
        : "Sub-agent started in a linked child chat. Waiting for the child result before continuing.",
  };
}

export async function getSubAgentStatus(input: Record<string, unknown>) {
  const taskId = String(input.taskId || input.childChatId || "").trim();
  if (!taskId) return { error: "Missing sub-agent task id" };
  const wait = input.wait === true;
  const timeoutMs = clampSubAgentWait(input.timeoutMs);
  const startedAt = Date.now();
  let result = await inspectSubAgentTask(taskId);
  while (
    wait &&
    isPendingSubAgentState(result.state) &&
    Date.now() - startedAt < timeoutMs
  ) {
    await sleep(500);
    result = await inspectSubAgentTask(taskId);
  }
  return {
    ...result,
    taskId,
    waitedMs: Date.now() - startedAt,
    timedOut: wait && isPendingSubAgentState(result.state),
  };
}

function isPendingSubAgentState(state: unknown) {
  return state === "running" || state === "missing";
}

async function inspectSubAgentTask(taskId: string) {
  const chats = await storage.chats.get();
  const chat = chats.find((item) => item.id === taskId);
  if (!chat) return { state: "missing", error: "Sub-agent task not found" };
  const assistant = [...chat.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const metrics = assistant?.metadata?.runMetrics as
    { endedAt?: unknown } | undefined;
  const text = assistantText(assistant);
  const progress = assistantProgress(assistant);
  const state = metrics?.endedAt ? "completed" : "running";
  return {
    state,
    title: chat.title,
    agentId: chat.agentId,
    parentChatId: chat.parentChatId,
    parentToolCallId: chat.parentToolCallId,
    progress,
    result: state === "completed" ? text : undefined,
    preview: text ? text.slice(0, 1200) : undefined,
  };
}

function assistantText(
  message:
    | { content?: string; parts?: Array<{ type: string; text?: string }> }
    | undefined,
) {
  if (!message) return "";
  const partText = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
  return (partText || message.content || "").trim();
}

function assistantProgress(
  message:
    | {
        parts?: Array<{
          type: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        }>;
      }
    | undefined,
) {
  const toolParts = (message?.parts || []).filter((part) =>
    part.type.startsWith("tool-"),
  );
  return toolParts.slice(-6).map((part) => ({
    toolName: part.toolName || part.type.slice("tool-".length),
    state: part.state,
    title: toolProgressTitle(part.input, part.output),
  }));
}

function toolProgressTitle(input: unknown, output: unknown) {
  const source = output && typeof output === "object" ? output : input;
  if (!source || typeof source !== "object") return undefined;
  const item = source as Record<string, unknown>;
  return (
    String(
      item.title || item.path || item.query || item.url || item.error || "",
    )
      .trim()
      .slice(0, 160) || undefined
  );
}

function clampSubAgentWait(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60_000;
  return Math.min(180_000, Math.max(0, Math.trunc(number)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSubAgentTitle(
  value: unknown,
  task: string,
  agentName: string,
) {
  const explicit = String(value || "").trim();
  const base = explicit || task.replace(/\s+/g, " ").slice(0, 60);
  return `${agentName}: ${base || "Sub-agent task"}`.slice(0, 90);
}

async function readFileFromUrl(input: Record<string, unknown>) {
  const url = String(input.url || "").trim();
  if (!url) return { error: "Missing file URL" };
  try {
    const { blob, type, size } = await fetchFileBlob(url);
    const format = String(input.format || "auto");
    const offset = clampOffset(input.offset);
    const limit = clampLimit(input.limit);
    if (format === "text" || (format === "auto" && isTextType(type, url))) {
      const text = await blob.text();
      return sliceOutput(
        { url, type, size, encoding: "text" },
        text,
        offset,
        limit,
        "text",
      );
    }
    if (isVisionImageMimeType(type) && format === "auto") {
      const dataUrl = await blobToDataUrl(blob);
      return imageToolOutput(dataUrl, type, size, url);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (format === "hex")
      return sliceOutput(
        binaryMetadata(url, type, size, "hex"),
        bytesToHex(bytes),
        offset,
        limit,
        "hex",
      );
    return sliceOutput(
      binaryMetadata(url, type, size, "base64"),
      bytesToBase64(bytes),
      offset,
      limit,
      "base64",
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

async function fetchFileBlob(url: string) {
  if (url.startsWith("data:")) return dataUrlBlob(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  const blob = await response.blob();
  return {
    blob,
    type: blob.type || "application/octet-stream",
    size: blob.size,
  };
}

function dataUrlBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid data URL");
  const type = match[1] || "application/octet-stream";
  const isBase64 = !!match[2];
  const body = decodeURIComponent(match[3] || "");
  const binary = isBase64 ? atob(body) : body;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type });
  return { blob, type, size: blob.size };
}

function imageToolOutput(
  dataUrl: string,
  type: string,
  size: number,
  url?: string,
) {
  return {
    success: true,
    url,
    type,
    size,
    _visionImage: { dataUrl, type, url, size },
    note: "Image pixels will be sent to the next model call as a vision image.",
  };
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function isTextType(type: string, url: string) {
  return (
    type.startsWith("text/") ||
    /\b(json|xml|yaml|csv|markdown|javascript|svg\+xml)\b/i.test(type) ||
    /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|ya?ml|html?|css|js|svg)(\?|#|$)/i.test(
      url,
    )
  );
}

function binaryMetadata(
  url: string,
  type: string,
  size: number,
  encoding: string,
) {
  return {
    url,
    type,
    size,
    encoding,
    note: "Binary file content is provided as a slice. If this is PDF, Office, audio, or video, semantic understanding may require a provider-specific file parser/transcription tool.",
  };
}

function sliceOutput(
  metadata: Record<string, unknown>,
  content: string,
  offset: number,
  limit: number,
  field: string,
) {
  return {
    success: true,
    ...metadata,
    offset,
    limit,
    totalLength: content.length,
    truncated: offset + limit < content.length,
    [field]: content.slice(offset, offset + limit),
  };
}

function clampOffset(value: unknown) {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

function clampLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return READ_ATTACHMENT_DEFAULT_LIMIT;
  return Math.min(READ_FILE_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BINARY_STRING_CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + BINARY_STRING_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
