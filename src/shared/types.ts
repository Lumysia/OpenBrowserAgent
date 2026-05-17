export type ProviderId =
  | "gemini"
  | "ollama"
  | "openai"
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
  apiKey?: string;
  baseUrl?: string;
  models?: ModelConfig[];
};

export type ProviderState = Partial<Record<ProviderId, ProviderConfig>>;

export type Preferences = {
  selectedModelId?: string;
  colorScheme?: "system" | "light" | "dark";
  accentColor?: "green" | "blue" | "pink" | "purple" | "amber";
  syncSettings?: boolean;
  syncProviders?: boolean;
  syncQuickActions?: boolean;
  syncChats?: boolean;
  autoScroll?: boolean;
  autoRetry?: boolean;
  maxToolSteps?: number;
};

export type QuickAction = {
  id: string;
  title: string;
  instruction: string;
};

export const CHAT_MODE = {
  agent: "Agent",
  ask: "Ask",
} as const;

export type ChatMode = (typeof CHAT_MODE)[keyof typeof CHAT_MODE];

export function isAskMode(mode: ChatMode) {
  return mode === CHAT_MODE.ask;
}

export type AttachmentTab = {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
};

export type UploadedAttachmentKind = "image" | "text" | "file";

export type UploadedAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: UploadedAttachmentKind;
  dataUrl?: string;
  text?: string;
};

export type SelectedElement = {
  success: boolean;
  aiId?: string;
  innerText?: string;
  outerHTML?: string;
  tagName?: string;
  value?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: number;
  parts?: ChatPart[];
  metadata?: Record<string, unknown>;
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
  createdAt: number;
  updatedAt: number;
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
  sendMessages: "sendMessages",
  generateTitle: "generateTitle",
  generateQuickAction: "generateQuickAction",
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
  chatMode: ChatMode;
  language?: string;
  maxToolSteps?: number;
  context?: {
    tabs?: AttachmentTab[];
    selectedElement?: SelectedElement | null;
    text?: string;
  };
};

export type AiStreamRequest =
  | { type: "abort" }
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
    }
  | {
      type: "generateQuickAction";
      modelId?: string;
      messages: ChatMessage[];
    };

export type SendMessagesRequest = Extract<
  AiStreamRequest,
  { type: (typeof AI_STREAM_REQUEST_TYPE)["sendMessages"] }
>;

export type GenerateTitleRequest = Extract<
  AiStreamRequest,
  { type: (typeof AI_STREAM_REQUEST_TYPE)["generateTitle"] }
>;

export type GenerateQuickActionRequest = Extract<
  AiStreamRequest,
  { type: (typeof AI_STREAM_REQUEST_TYPE)["generateQuickAction"] }
>;

export type AiStreamResponse =
  | { type: "chunk"; chunk: unknown }
  | { type: "end" }
  | { type: "error"; error: string }
  | { type: "title"; title: string }
  | { type: "quickAction"; quickAction: QuickAction };

export const providerLabels: Record<ProviderId, string> = {
  gemini: "Gemini",
  ollama: "Ollama",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  aihubmix: "AIHubMix",
  deepseek: "DeepSeek",
  glm: "Z.ai (Zhipu)",
  aigateway: "Vercel AI Gateway",
  minimax: "Minimax",
};

export const providerDefaultBaseUrls: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
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
