import { TOOL_NAME } from "../../shared/tool-names";
import { chatHistory } from "../session-tools";
import { json, schema, type ToolDefinition } from "./types";

export const chatHistoryTool: ToolDefinition = {
  name: TOOL_NAME.chatHistory,
  group: "history",
  onDemand: true,
  summary: "Search, read or delete saved chats",
  description:
    "Use the user's saved chats: search (query), read (chatId; offset/limit in messages), delete (chatId).",
  parameters: schema(
    {
      action: { type: "string", enum: ["search", "read", "delete"] },
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
