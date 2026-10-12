import { STORAGE_KEYS } from "./storage-keys";

// Each chat's content is stored under its own key next to the chat list.
export function chatContentKey(chatId: string) {
  return `${STORAGE_KEYS.chats}/${chatId}`;
}
