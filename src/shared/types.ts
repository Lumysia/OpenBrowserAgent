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
  autoScroll?: boolean;
};

export type QuickAction = {
  id: string;
  title: string;
  instruction: string;
};

export type ChatMode = "Agent" | "Ask";

export type AttachmentTab = {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
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

export type ChatPart = {
  id: string;
  type: "text" | "reasoning" | `tool-${string}`;
  text?: string;
  append?: boolean;
  toolName?: string;
  state?:
    | "streaming"
    | "done"
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
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

export type SendMessagesBody = {
  modelId?: string;
  chatMode: ChatMode;
  language?: string;
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
      message: string;
      metadata?: Record<string, unknown>;
    };

export type AiStreamResponse =
  | { type: "chunk"; chunk: unknown }
  | { type: "end" }
  | { type: "error"; error: string }
  | { type: "title"; title: string };

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
