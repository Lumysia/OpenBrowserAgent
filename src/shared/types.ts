import type { UploadedAttachmentKind } from "./attachments";
import type { AgentIconId } from "./agent-icon-registry";
import type { ReasoningEffort } from "./reasoning";

export type ProviderId =
  | "gemini"
  | "ollama"
  | "openai"
  | "openai-responses"
  | "anthropic"
  | "openrouter"
  | "aihubmix"
  | "deepseek"
  | "glm"
  | "aigateway"
  | "minimax";

export type ModelConfig = {
  id: string;
  name: string;
  displayName?: string;
};

export type ProviderConfig = {
  id?: string;
  type?: ProviderId;
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelConfig[];
  imageModels?: ModelConfig[];
};

export type ProviderState = Record<string, ProviderConfig>;

export type { McpServerConfig } from "./mcp";

export type Preferences = {
  selectedModelId?: string;
  selectedAgentId?: string;
  selectedImageModelId?: string;
  imageGenerationEnabled?: boolean;
  imageGenerationSize?: string;
  colorScheme?: "system" | "light" | "dark";
  accentColor?: "green" | "blue" | "pink" | "purple" | "amber";
  syncSettings?: boolean;
  syncProviders?: boolean;
  syncAgents?: boolean;
  syncSkills?: boolean;
  syncMcpServers?: boolean;
  syncChats?: boolean;
  autoSelectSkills?: boolean;
  autoScroll?: boolean;
  autoRetry?: boolean;
  maxToolSteps?: number;
  reasoningEffort?: ReasoningEffort;
  contextBudgetEnabled?: boolean;
  contextRequestMaxChars?: number;
  contextTailMinMessages?: number;
  contextToolResultMaxChars?: number;
};

export type Agent = {
  id: string;
  name: string;
  description?: string;
  icon?: AgentIconId;
  capabilities: AgentCapabilities;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AgentWorkspace = {
  agentId: string;
  files: WorkspaceFile[];
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceFileKind = "markdown" | "text";

export type WorkspaceFile = {
  path: string;
  content: string;
  kind: WorkspaceFileKind;
  updatedAt: number;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  files: SkillFile[];
  enabled?: boolean;
  builtin?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type SkillFileKind = "markdown" | "text" | "asset" | "script";

export type SkillFile = {
  path: string;
  content: string;
  kind: SkillFileKind;
  encoding?: "utf-8" | "base64";
  updatedAt?: number;
};

export type AgentCapabilities = {
  browserAutomation: boolean;
  browserTools: boolean;
  deferredBrowserTools: boolean;
  cdpTools: boolean;
  dangerousCodeExecution: boolean;
  mcpTools: boolean;
  mcpManagement: boolean;
  skillTools: boolean;
  skillCreation: boolean;
  workspaceRead: boolean;
  workspaceWrite: boolean;
  memoryRead: boolean;
  memoryWrite: boolean;
  chatHistoryRead: boolean;
  chatHistoryWrite: boolean;
  imageGeneration: boolean;
  currentTime: boolean;
  fileUrlRead: boolean;
};

export type AttachmentTab = {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

export type UploadedAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: UploadedAttachmentKind;
  dataUrl?: string;
  text?: string;
};

export type ImageGenerationJobStatus = "running" | "succeeded" | "failed";

export type ImageGenerationJob = {
  id: string;
  chatId: string;
  messageId?: string;
  toolCallId?: string;
  status: ImageGenerationJobStatus;
  prompt: string;
  model?: string;
  size?: string;
  referenceAttachmentIds?: string[];
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type SelectedElement = {
  success: boolean;
  aiId?: string;
  innerText?: string;
  outerHTML?: string;
  tagName?: string;
  value?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageDataUrl?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: number;
  parts?: ChatPart[];
  metadata?: Record<string, unknown>;
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  cost?: number;
};

export type PromptBreakdown = {
  systemPromptChars?: number;
  userPromptChars?: number;
  conversationPromptChars?: number;
  tabPromptChars?: number;
  selectedElementPromptChars?: number;
  skillPromptChars?: number;
  attachmentPromptChars?: number;
  toolCallPromptChars?: number;
  sourcePromptChars?: number;
  otherContextPromptChars?: number;
};

export type RunMetrics = {
  startedAt?: number;
  firstTokenAt?: number;
  endedAt?: number;
  streamEventIndex?: number;
  outputMode?: "streaming" | "buffered";
  outputCharacters?: number;
  usage?: TokenUsage;
  promptBreakdown?: PromptBreakdown;
  contextBudget?: ContextBudgetReport;
};

export type ContextBudgetReport = {
  originalChars: number;
  finalChars: number;
  prunedChars: number;
  prunedMessages: number;
  truncatedToolResults: number;
};

export const TOOL_PART_PREFIX = "tool-";

export type ToolPartType = `${typeof TOOL_PART_PREFIX}${string}`;

export function toolPartType(toolName: string): ToolPartType {
  return `${TOOL_PART_PREFIX}${toolName}`;
}

export function isToolPartType(type: string): type is ToolPartType {
  return type.startsWith(TOOL_PART_PREFIX);
}

export function toolNameFromPartType(type: ToolPartType) {
  return type.slice(TOOL_PART_PREFIX.length);
}

export const CHAT_PART_STATE = {
  streaming: "streaming",
  done: "done",
  inputStreaming: "input-streaming",
  inputAvailable: "input-available",
  outputAvailable: "output-available",
  outputError: "output-error",
} as const;

export type ChatPart = {
  id: string;
  type: "text" | "reasoning" | ToolPartType;
  text?: string;
  append?: boolean;
  toolName?: string;
  state?:
    | (typeof CHAT_PART_STATE)["streaming"]
    | (typeof CHAT_PART_STATE)["done"]
    | (typeof CHAT_PART_STATE)["inputStreaming"]
    | (typeof CHAT_PART_STATE)["inputAvailable"]
    | (typeof CHAT_PART_STATE)["outputAvailable"]
    | (typeof CHAT_PART_STATE)["outputError"];
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type Chat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  imageGenerationJobs?: ImageGenerationJob[];
  sources?: ChatSource[];
  createdAt: number;
  updatedAt: number;
};

export type ChatSource = {
  id: string;
  kind: "page" | "search" | "file" | "image" | "skill" | "tool";
  title: string;
  url?: string;
  tabId?: number;
  snippet?: string;
  createdAt: number;
};

export type ChatTab = {
  id: string;
  chatId: string;
  title: string;
  active?: boolean;
};

export const AI_STREAM_PORT_NAME = "ai-stream";

export const AI_STREAM_REQUEST_TYPE = {
  abort: "abort",
  queueMessage: "queueMessage",
  deleteQueuedMessage: "deleteQueuedMessage",
  attachStream: "attachStream",
  sendMessages: "sendMessages",
  generateTitle: "generateTitle",
} as const;

export const AI_TEXT_CHUNK_TYPE = {
  textStart: "text-start",
  textDelta: "text-delta",
  textEnd: "text-end",
  textNoteStart: "text-note-start",
  textNoteDelta: "text-note-delta",
  textNoteEnd: "text-note-end",
} as const;

export type SendMessagesBody = {
  modelId?: string;
  agentCapabilities: AgentCapabilities;
  language?: string;
  maxToolSteps?: number;
  context?: {
    tabs?: AttachmentTab[];
    selectedElements?: SelectedElement[];
    text?: string;
    uploadedAttachments?: UploadedAttachment[];
    availableSkills?: Skill[];
    sources?: ChatSource[];
    agent?: Agent;
    imageGenerationEnabled?: boolean;
    autoSelectSkills?: boolean;
  };
};

export type AiStreamRequest =
  | { type: "abort" }
  | { type: "queueMessage"; id: string; content: string }
  | { type: "deleteQueuedMessage"; id: string }
  | {
      type: "attachStream";
      chatId: string;
      messageId: string;
      afterSequence?: number;
    }
  | {
      type: "sendMessages";
      chatId: string;
      trigger?: string;
      messageId?: string;
      messages: ChatMessage[];
      body: SendMessagesBody;
    }
  | {
      type: "generateTitle";
      modelId?: string;
      message: string;
      metadata?: Record<string, unknown>;
    };

export type SendMessagesRequest = Extract<
  AiStreamRequest,
  { type: (typeof AI_STREAM_REQUEST_TYPE)["sendMessages"] }
>;

export type GenerateTitleRequest = Extract<
  AiStreamRequest,
  { type: (typeof AI_STREAM_REQUEST_TYPE)["generateTitle"] }
>;

export type AiStreamResponse = (
  | { type: "chunk"; chunk: unknown }
  | { type: "metrics"; metrics: Partial<RunMetrics> }
  | {
      type: "queuedMessages";
      messages: Array<{ id: string; content: string; createdAt: number }>;
      assistantMessageId: string;
      createdAt: number;
    }
  | { type: "end" }
  | { type: "error"; error: string }
  | { type: "title"; title: string }
) & { sequence?: number };

export const providerLabels: Record<ProviderId, string> = {
  gemini: "Gemini",
  ollama: "Ollama",
  openai: "OpenAI-compatible",
  "openai-responses": "OpenAI Responses",
  anthropic: "Anthropic-compatible",
  openrouter: "OpenRouter",
  aihubmix: "AIHubMix",
  deepseek: "DeepSeek",
  glm: "Z.ai (Zhipu)",
  aigateway: "Vercel AI Gateway",
  minimax: "Minimax",
};

export const providerDefaultBaseUrls: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  aihubmix: "https://aihubmix.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  glm: "https://api.z.ai/api/paas/v4",
  aigateway: "https://api.ai-gateway.workers.dev/v1",
  minimax: "https://api.minimax.io/v1",
  ollama: "http://localhost:11434",
};

export const languageLabels: Record<string, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "ja-JP": "日本語",
  ko: "한국어",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "pt-BR": "Português (Brasil)",
};
