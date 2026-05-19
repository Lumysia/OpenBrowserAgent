import {
  Download,
  History,
  Upload,
  MessageCirclePlus,
  Settings,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import type { Messages } from "../../src/shared/i18n";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { Chat, ChatMode, Preferences } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import {
  exportChatAsOpenAiJson,
  importChatFromOpenAiJson,
} from "./chat-export";
import { IconTooltip } from "./icon-tooltip";

export function SidepanelHeader({
  t,
  currentChat,
  mode,
  preferences,
  onSetChats,
  onCreateChat,
  onImportChat,
  onSetShowHistory,
}: {
  t: Messages;
  currentChat?: Chat;
  mode: ChatMode;
  preferences?: Preferences;
  onSetChats: (value: Chat[]) => void;
  onCreateChat: () => void;
  onImportChat: (chat: Chat) => void;
  onSetShowHistory: (value: boolean) => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function importChat(file: File | undefined) {
    if (!file) return;
    try {
      onImportChat(await importChatFromOpenAiJson(file));
    } catch (error) {
      console.warn("Failed to import chat", error);
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <header className="sidepanel-header">
      <div className="sidepanel-topbar">
        <IconTooltip label={t.sidepanel.clearAllChats}>
          <Button variant="ghost" size="icon" onClick={() => onSetChats([])}>
            <Trash2 size={18} />
          </Button>
        </IconTooltip>
        <div />
        <div className="topbar-actions">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void importChat(event.target.files?.[0])}
          />
          <IconTooltip label={t.words.newChat}>
            <Button variant="ghost" size="icon" onClick={onCreateChat}>
              <MessageCirclePlus size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.sidepanel.importChatOpenAi}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.sidepanel.exportChatOpenAi}>
            <Button
              variant="ghost"
              size="icon"
              disabled={!currentChat?.messages.length}
              onClick={() =>
                exportChatAsOpenAiJson(currentChat, mode, preferences)
              }
            >
              <Download size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.sidepanel.chatHistory}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSetShowHistory(true)}
            >
              <History size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.common.settings}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openOrFocusOptions().catch(console.warn)}
            >
              <Settings size={18} />
            </Button>
          </IconTooltip>
        </div>
      </div>
    </header>
  );
}
