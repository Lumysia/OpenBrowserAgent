import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { resolveAgent } from "../shared/agents";
import { isVisionImageMimeType } from "../shared/attachments";
import {
  BINARY_STRING_CHUNK_SIZE,
  READ_ATTACHMENT_DEFAULT_LIMIT,
  READ_FILE_MAX_LIMIT,
} from "../shared/config";
import {
  SKILL_ENTRY_PATH,
  createSkillPackage,
  parseSkillFrontmatter,
  normalizeSkillName,
} from "../shared/skills";
import { storage } from "../shared/storage";
import {
  type AgentCapabilities,
  type AgentWorkspace,
  type Preferences,
  type McpServerConfig,
  type Skill,
  type SkillFileKind,
  type UploadedAttachment,
} from "../shared/types";
import {
  listSkills,
  readSkill,
  readSkillFile,
  readUploadedAttachment,
} from "./attachment-messages";
import { generateImage } from "./image-generation";
import {
  getLocalExecutionBridgeStatus,
  listLocalExecutionBridges,
  startLocalExecutionBridge,
  cancelLocalExecutionBridge,
  addLocalExecutionBridge,
  updateLocalExecutionBridge,
  testLocalExecutionBridgeConfig,
  deleteLocalExecutionBridge,
} from "./local-agent-tools";
import {
  addMemory,
  addUserProfileNote,
  listMemory,
  listUserProfile,
  removeMemory,
  removeUserProfileNote,
  updateMemory,
  updateUserProfileNote,
} from "./memory-tools";
import {
  addMcpServer,
  deleteMcpServer,
  executeMcpTool,
  isMcpToolName,
  listMcpServers,
  mcpToolsForPrompt,
  testMcpServer,
  updateMcpServer,
} from "./mcp-tools";
import {
  deleteChatThread,
  readChatThread,
  searchChatHistory,
} from "./session-tools";
import { safeExecuteBrowserTool } from "./tools";
import { browserToolsForPrompt, deferredBrowserTools } from "./tool-schema";
import {
  deleteWorkspaceFile,
  listWorkspaceFiles,
  patchWorkspaceFile,
  readWorkspaceFile,
  searchWorkspaceFiles,
  writeWorkspaceFile,
} from "./workspace-tools";

export function toolsForCapabilities(
  capabilities: AgentCapabilities,
  hasUploadedAttachments: boolean,
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
      hasUploadedAttachments,
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
        uploadedAttachments.length > 0,
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
}: {
  toolName: string;
  input: Record<string, unknown>;
  context?: { chatId?: string; messageId?: string; toolCallId?: string };
  uploadedAttachments: UploadedAttachment[];
  availableSkills: Skill[];
  capabilities: AgentCapabilities;
  workspace?: AgentWorkspace;
}) {
  if (toolName === BROWSER_TOOL_NAME.loadBrowserTools)
    return loadBrowserTools(input, capabilities);
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
  if (toolName === BROWSER_TOOL_NAME.listLocalExecutionBridges)
    return listLocalExecutionBridges();
  if (toolName === BROWSER_TOOL_NAME.addLocalExecutionBridge)
    return addLocalExecutionBridge(input);
  if (toolName === BROWSER_TOOL_NAME.updateLocalExecutionBridge)
    return updateLocalExecutionBridge(input);
  if (toolName === BROWSER_TOOL_NAME.testLocalExecutionBridge)
    return testLocalExecutionBridgeConfig(input);
  if (toolName === BROWSER_TOOL_NAME.deleteLocalExecutionBridge)
    return deleteLocalExecutionBridge(input);
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
  if (toolName === BROWSER_TOOL_NAME.listSkills)
    return listSkills(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.createSkill)
    return createSkill(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.readSkill)
    return readSkill(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.readSkillFile)
    return readSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.updateSkillFile)
    return updateSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.patchSkillFile)
    return patchSkillFile(availableSkills, input);
  if (toolName === BROWSER_TOOL_NAME.listWorkspaceFiles)
    return listWorkspaceFiles(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.readWorkspaceFile)
    return readWorkspaceFile(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.writeWorkspaceFile)
    return writeWorkspaceFile(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.patchWorkspaceFile)
    return patchWorkspaceFile(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.deleteWorkspaceFile)
    return deleteWorkspaceFile(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.searchWorkspaceFiles)
    return searchWorkspaceFiles(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.listMemory)
    return listMemory(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.addMemory)
    return addMemory(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.updateMemory)
    return updateMemory(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.removeMemory)
    return removeMemory(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.listUserProfile)
    return listUserProfile(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.addUserProfileNote)
    return addUserProfileNote(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.updateUserProfileNote)
    return updateUserProfileNote(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.removeUserProfileNote)
    return removeUserProfileNote(workspace, input);
  if (toolName === BROWSER_TOOL_NAME.searchChatHistory)
    return searchChatHistory(input);
  if (toolName === BROWSER_TOOL_NAME.readChatThread)
    return readChatThread(input);
  if (toolName === BROWSER_TOOL_NAME.deleteChatThread)
    return deleteChatThread(input);
  if (toolName === BROWSER_TOOL_NAME.listMcpServers) return listMcpServers();
  if (toolName === BROWSER_TOOL_NAME.addMcpServer) return addMcpServer(input);
  if (toolName === BROWSER_TOOL_NAME.updateMcpServer)
    return updateMcpServer(input);
  if (toolName === BROWSER_TOOL_NAME.testMcpServer) return testMcpServer(input);
  if (toolName === BROWSER_TOOL_NAME.deleteMcpServer)
    return deleteMcpServer(input);
  if (isMcpToolName(toolName)) return executeMcpTool(toolName, input);
  if (toolName === BROWSER_TOOL_NAME.generateImage)
    return generateImage(uploadedAttachments, input, context);
  if (toolName === BROWSER_TOOL_NAME.readFileFromUrl)
    return readFileFromUrl(input);
  return safeExecuteBrowserTool(toolName, input);
}

export function loadDeferredToolNames(
  output: unknown,
  loadedToolNames: Set<string>,
) {
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

function loadBrowserTools(
  input: Record<string, unknown>,
  capabilities: AgentCapabilities,
) {
  if (!capabilities.cdpTools)
    return {
      loadedToolNames: [],
      tools: [],
      error: "CDP tools are disabled for the active agent",
    };
  const requestedNames = Array.isArray(input.names)
    ? input.names
        .map(String)
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const query = String(input.query || "")
    .trim()
    .toLowerCase();
  const category = String(input.category || "")
    .trim()
    .toLowerCase();
  const matches = deferredBrowserTools
    .map((item) => toolCatalogItem(item, capabilities))
    .filter((item) => item.available)
    .filter((item) => !category || item.category === category)
    .map((item) => ({
      item,
      score: requestedNames.length
        ? requestedNames.includes(item.name)
          ? 1
          : 0
        : queryScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item)
    .slice(0, 8);
  return {
    loadedToolNames: matches.map((item) => item.name),
    tools: matches.map((item) => ({
      ...item,
      schema: deferredBrowserTools.find(
        (tool) => tool.function.name === item.name,
      )?.function,
    })),
  };
}

function queryScore(item: ReturnType<typeof toolCatalogItem>, query: string) {
  if (!query) return 1;
  const searchable = `${item.name} ${item.description} ${item.category}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  if (searchable.includes(query)) return 100;
  const terms = query
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim().toLowerCase())
    .filter(
      (term) => term.length > 2 && !DEFERRED_TOOL_QUERY_STOP_WORDS.has(term),
    );
  if (!terms.length) return 1;
  return terms.reduce(
    (score, term) => score + (searchable.includes(term) ? 1 : 0),
    0,
  );
}

function toolCatalogItem(
  item: (typeof deferredBrowserTools)[number],
  capabilities: AgentCapabilities,
) {
  const name = item.function.name;
  const dangerous = name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript;
  const available = dangerous ? capabilities.javascriptExecution : true;
  return {
    name,
    description: item.function.description,
    category: toolCategory(name),
    available,
    unavailableReason: available
      ? undefined
      : dangerous
        ? "Page JavaScript execution is disabled in General settings"
        : "CDP tools are disabled for the active agent",
  };
}

function toolCategory(name: string) {
  if (name in TOOL_CATEGORY_BY_NAME)
    return TOOL_CATEGORY_BY_NAME[name as keyof typeof TOOL_CATEGORY_BY_NAME];
  if (name.startsWith("cdp")) return "cdp";
  return "common";
}

const TOOL_CATEGORY_BY_NAME = {
  [BROWSER_TOOL_NAME.startSubAgent]: "agents",
  [BROWSER_TOOL_NAME.getSubAgentStatus]: "agents",
  [BROWSER_TOOL_NAME.readUploadedAttachment]: "files",
  [BROWSER_TOOL_NAME.readFileFromUrl]: "files",
  [BROWSER_TOOL_NAME.generateImage]: "image",
  [BROWSER_TOOL_NAME.listSkills]: "skills",
  [BROWSER_TOOL_NAME.createSkill]: "skills",
  [BROWSER_TOOL_NAME.readSkill]: "skills",
  [BROWSER_TOOL_NAME.readSkillFile]: "skills",
  [BROWSER_TOOL_NAME.updateSkillFile]: "skills",
  [BROWSER_TOOL_NAME.patchSkillFile]: "skills",
  [BROWSER_TOOL_NAME.listWorkspaceFiles]: "files",
  [BROWSER_TOOL_NAME.readWorkspaceFile]: "files",
  [BROWSER_TOOL_NAME.writeWorkspaceFile]: "files",
  [BROWSER_TOOL_NAME.patchWorkspaceFile]: "files",
  [BROWSER_TOOL_NAME.deleteWorkspaceFile]: "files",
  [BROWSER_TOOL_NAME.searchWorkspaceFiles]: "files",
  [BROWSER_TOOL_NAME.listMemory]: "memory",
  [BROWSER_TOOL_NAME.addMemory]: "memory",
  [BROWSER_TOOL_NAME.updateMemory]: "memory",
  [BROWSER_TOOL_NAME.removeMemory]: "memory",
  [BROWSER_TOOL_NAME.listUserProfile]: "memory",
  [BROWSER_TOOL_NAME.addUserProfileNote]: "memory",
  [BROWSER_TOOL_NAME.updateUserProfileNote]: "memory",
  [BROWSER_TOOL_NAME.removeUserProfileNote]: "memory",
  [BROWSER_TOOL_NAME.searchChatHistory]: "history",
  [BROWSER_TOOL_NAME.readChatThread]: "history",
  [BROWSER_TOOL_NAME.deleteChatThread]: "history",
} as const;

const DEFERRED_TOOL_QUERY_STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "into",
  "from",
  "current",
  "tool",
  "tools",
]);

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
    | { endedAt?: unknown }
    | undefined;
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

async function createSkill(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const name = normalizeSkillName(String(input.name || ""));
  const description = String(input.description || "").trim();
  const instruction = String(input.instruction || input.content || "").trim();
  const reason = String(input.reason || "").trim();
  if (!name) return { error: "Missing skill name" };
  if (!instruction)
    return { error: "Missing reusable skill instruction", name };
  if (!reason) return { error: "Missing reusable creation reason", name };
  const existing = availableSkills.find(
    (skill) => normalizeSkillName(skill.name || "") === name,
  );
  if (existing)
    return {
      error: "Skill already exists",
      skillId: existing.id,
      name: existing.name,
      nextAction:
        "Use updateSkillFile or patchSkillFile for this existing skill.",
    };

  const skill = createSkillPackage({ name, description, instruction });
  const allSkills = (await storage.skills.get()) || [];
  await storage.skills.set([...allSkills, skill]);
  availableSkills.push(skill);
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    created: true,
    reason,
    files: skill.files?.map((file) => ({
      path: file.path,
      kind: file.kind,
      size: file.content.length,
    })),
  };
}

async function updateSkillFile(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "").trim();
  const content = String(input.content ?? "");
  const reason = String(input.reason || "").trim();
  if (!skillId || !path)
    return { error: "Missing skillId or path", skillId, path };
  if (!reason)
    return { error: "Missing reusable update reason", skillId, path };
  const current = availableSkills.find((skill) => skill.id === skillId);
  if (!current) return { error: "Skill not found", skillId };

  const now = Date.now();
  const existingFile = current.files?.find((file) => file.path === path);
  const file = {
    path,
    kind: existingFile?.kind || inferSkillFileKind(path),
    encoding: "utf-8" as const,
    content,
    updatedAt: now,
  };
  const nextSkill: Skill = {
    ...current,
    ...metadataPatch(path, content),
    files: existingFile
      ? current.files.map((item) => (item.path === path ? file : item))
      : [...(current.files || []), file],
    updatedAt: now,
  };

  const allSkills = (await storage.skills.get()) || [];
  await storage.skills.set(
    allSkills.map((skill) => (skill.id === skillId ? nextSkill : skill)),
  );
  const availableIndex = availableSkills.findIndex(
    (skill) => skill.id === skillId,
  );
  if (availableIndex >= 0) availableSkills[availableIndex] = nextSkill;
  return {
    id: nextSkill.id,
    name: nextSkill.name,
    path,
    updated: true,
    reason,
  };
}

async function patchSkillFile(
  availableSkills: Skill[],
  input: Record<string, unknown>,
) {
  const skillId = String(input.skillId || input.id || "");
  const path = String(input.path || "").trim();
  const reason = String(input.reason || "").trim();
  const replacements = parseSkillFileReplacements(input.replacements);
  if (!skillId || !path)
    return { error: "Missing skillId or path", skillId, path };
  if (!reason) return { error: "Missing reusable patch reason", skillId, path };
  if (!replacements.length)
    return { error: "Missing replacements", skillId, path };

  const current = availableSkills.find((skill) => skill.id === skillId);
  if (!current) return { error: "Skill not found", skillId };
  const existingFile = current.files?.find((file) => file.path === path);
  if (!existingFile) return { error: "Skill file not found", skillId, path };

  let content = existingFile.content || "";
  for (const [index, replacement] of replacements.entries()) {
    const matches = countOccurrences(content, replacement.oldText);
    if (matches !== 1)
      return {
        error:
          matches === 0
            ? "Replacement oldText not found"
            : "Replacement oldText matched more than once",
        skillId,
        path,
        replacementIndex: index,
        matches,
      };
    content = content.replace(replacement.oldText, replacement.newText);
  }

  const now = Date.now();
  const file = { ...existingFile, content, updatedAt: now };
  const nextSkill: Skill = {
    ...current,
    ...metadataPatch(path, content),
    files: current.files.map((item) => (item.path === path ? file : item)),
    updatedAt: now,
  };

  const allSkills = (await storage.skills.get()) || [];
  await storage.skills.set(
    allSkills.map((skill) => (skill.id === skillId ? nextSkill : skill)),
  );
  const availableIndex = availableSkills.findIndex(
    (skill) => skill.id === skillId,
  );
  if (availableIndex >= 0) availableSkills[availableIndex] = nextSkill;
  return {
    id: nextSkill.id,
    name: nextSkill.name,
    path,
    patched: true,
    replacements: replacements.length,
    reason,
  };
}

function parseSkillFileReplacements(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const replacement = item as { oldText?: unknown; newText?: unknown };
      return {
        oldText: String(replacement.oldText ?? ""),
        newText: String(replacement.newText ?? ""),
      };
    })
    .filter((item) => item.oldText.length > 0);
}

function countOccurrences(text: string, search: string) {
  let count = 0;
  let index = 0;
  while (true) {
    const next = text.indexOf(search, index);
    if (next === -1) return count;
    count += 1;
    index = next + search.length;
  }
}

function metadataPatch(path: string, content: string) {
  if (path !== SKILL_ENTRY_PATH) return {};
  const metadata = parseSkillFrontmatter(content);
  return {
    ...(metadata.name ? { name: normalizeSkillName(metadata.name) } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
  };
}

function inferSkillFileKind(path: string): SkillFileKind {
  if (path === SKILL_ENTRY_PATH || path.endsWith(".md")) return "markdown";
  if (path.startsWith("scripts/")) return "script";
  if (path.startsWith("assets/")) return "asset";
  return "text";
}
