import type { ChatMessage, ChatSource, ImageGenerationJob } from "./types";

// Chats are stored as metadata (the list) apart from their content.
export type ChatMeta = {
  id: string;
  title: string;
  agentId?: string;
  kind?: "normal" | "subagent";
  parentChatId?: string;
  parentMessageId?: string;
  parentToolCallId?: string;
  childChatIds?: string[];
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ChatContent = {
  messages: ChatMessage[];
  imageGenerationJobs?: ImageGenerationJob[];
  sources?: ChatSource[];
};

export type Chat = ChatMeta & ChatContent;

// A list entry: metadata plus facts about the content (see chatFacts).
export type ChatSummary = ChatMeta & {
  messageCount: number;
  running?: boolean;
  attachmentIds?: string[];
};
