import { TOOL_NAME } from "../../shared/tool-names";
import { CHAT_HISTORY_ACTIONS, chatHistory } from "../session-tools";
import { json, schema, type ToolDefinition } from "./types";

export const chatHistoryTool: ToolDefinition = {
  name: TOOL_NAME.chatHistory,
  effects: { byAction: { search: "read", read: "read", delete: "act" } },
  group: "history",
  onDemand: true,
  summary: "Search, read or delete saved chats",
  description:
    "Use the user's saved chats: search (query), read (chatId; offset/limit in messages), delete (chatId).",
  parameters: schema(
    {
      action: { type: "string", enum: CHAT_HISTORY_ACTIONS },
      query: { type: "string" },
      chatId: { type: "string" },
      offset: { type: "number" },
      limit: { type: "number" },
    },
    ["action"],
  ),
  async execute(input) {
    return json((await chatHistory(input)) as Record<string, unknown>);
  },
};
