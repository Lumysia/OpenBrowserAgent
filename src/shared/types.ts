import type { UploadedAttachmentKind } from "./attachments";
import type { AgentIconId } from "./agent-icon-registry";
import type { ToolGroup } from "./agents";
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
  contextLength?: number;
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
  autoScroll?: boolean;
  autoRetry?: boolean;
  maxToolSteps?: number;
  reasoningEffort?: ReasoningEffort;
  // Model for auxiliary requests such as compaction; unset uses the chat's
  // own model.
  helperModelId?: string;
};

export type SyncBackendType = "browser-sync" | "webdav";

export type BrowserSyncBackendConfig = {
  id: string;
  type: "browser-sync";
  name: string;
};

export type WebDavSyncBackendConfig = {
  id: string;
  type: "webdav";
  name: string;
  url: string;
  username?: string;
  password?: string;
};

export type SyncBackendConfig =
  BrowserSyncBackendConfig | WebDavSyncBackendConfig;

export type Agent = {
  id: string;
  name: string;
  description?: string;
  icon?: AgentIconId;
  // Instructions added to the system prompt.
  prompt: string;
  toolGroups: ToolGroup[];
  // Unset uses the model picked in the composer.
  modelId?: string;
  // Private files (memory, user notes) that persist across chats.
  workspace: boolean;
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

export type LocalExecutionBridgeConfig = {
  id: string;
  name: string;
  description?: string;
  hostName: string;
  hostAddress?: string;
  secret?: string;
  bridgeKey?: string;
  defaultCwd?: string;
  timeoutMs?: number;
  lastTestedAt?: number;
  lastTestError?: string;
  createdAt: number;
  updatedAt: number;
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
  // Ref of the element for page tools ("sel-…").
  ref?: string;
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

export type RunMetrics = {
  startedAt?: number;
  firstTokenAt?: number;
  endedAt?: number;
  streamEventIndex?: number;
  outputCharacters?: number;
  // Provider-reported totals over every model request of the run.
  usage?: TokenUsage;
  modelCalls?: number;
  // Input tokens (cached included) of the run's largest single request.
  largestInputTokens?: number;
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
  type: "text" | "reasoning" | "summary" | ToolPartType;
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

export type { Chat, ChatContent, ChatMeta, ChatSummary } from "./chat-types";

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
  answerQuestion: "answerQuestion",
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
  // A compaction summary that replaced earlier context of the run.
  contextSummary: "context-summary",
} as const;

export type SendMessagesBody = {
  agentId?: string;
  modelId?: string;
  language?: string;
  uploadedAttachments?: UploadedAttachment[];
  // A sub-agent chat, whose agent cannot start further sub-agents.
  subAgent?: boolean;
};

export type AiStreamRequest =
  | { type: "abort" }
  | {
      type: "answerQuestion";
      toolCallId: string;
      answers: QuestionToolAnswer[];
    }
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

export type QuestionToolOption = {
  label: string;
  description?: string;
};

export type QuestionToolQuestion = {
  question: string;
  options: QuestionToolOption[];
  multiple?: boolean;
  custom?: boolean;
};

export type QuestionToolAnswer = {
  question: string;
  answers: string[];
  customAnswer?: string;
};

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
