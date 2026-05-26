import {
  ArrowLeft,
  Cloud,
  CloudCheck,
  CloudOff,
  CloudUpload,
  History,
  MessageCirclePlus,
  Settings,
} from "lucide-react";
import { OPTIONS_HASH } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type { SyncWriteStatus } from "../../src/shared/storage-sync-cache";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { Chat } from "../../src/shared/types";
import { chatDisplayTitle } from "../../src/ui/agent-display";
import { Button } from "../../src/ui/components";
import { IconTooltip } from "./icon-tooltip";

export function SidepanelHeader({
  t,
  currentChat,
  parentChat,
  syncWriteStatus,
  onCreateChat,
  onSetShowHistory,
  onSelectChat,
}: {
  t: Messages;
  currentChat?: Chat;
  parentChat?: Chat;
  syncWriteStatus?: SyncWriteStatus;
  onCreateChat: () => void;
  onSetShowHistory: (value: boolean) => void;
  onSelectChat: (chatId: string) => void;
}) {
  const syncStatus = cloudSyncStatus(t, syncWriteStatus);
  const SyncIcon = syncStatus.Icon;
  return (
    <header className="sidepanel-header">
      <div className="sidepanel-topbar">
        <div className="topbar-left-actions">
          {parentChat ? (
            <IconTooltip label={t.sidepanel.backToParentChat}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.sidepanel.backToParentChat}
                onClick={() => onSelectChat(parentChat.id)}
              >
                <ArrowLeft size={18} />
              </Button>
            </IconTooltip>
          ) : (
            <IconTooltip label={t.common.settings}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.common.settings}
                onClick={() => openOrFocusOptions().catch(console.warn)}
              >
                <Settings size={18} />
              </Button>
            </IconTooltip>
          )}
          <IconTooltip label={syncStatus.label}>
            <Button
              variant="ghost"
              size="icon"
              className={`cloud-sync-button ${syncStatus.className}`}
              aria-label={syncStatus.label}
              onClick={() =>
                openOrFocusOptions(OPTIONS_HASH.sync).catch(console.warn)
              }
            >
              <SyncIcon size={18} />
            </Button>
          </IconTooltip>
        </div>
        <div className="sidepanel-chat-context">
          {parentChat && (
            <>
              <strong>{t.sidepanel.subAgentChat}</strong>
              <small>
                {chatDisplayTitle(currentChat, t)} ·{" "}
                {chatDisplayTitle(parentChat, t)}
              </small>
            </>
          )}
        </div>
        <div className="topbar-actions">
          <IconTooltip label={t.sidepanel.chatHistory}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.sidepanel.chatHistory}
              onClick={() => onSetShowHistory(true)}
            >
              <History size={18} />
            </Button>
          </IconTooltip>
          <IconTooltip label={t.words.newChat}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.words.newChat}
              onClick={onCreateChat}
            >
              <MessageCirclePlus size={18} />
            </Button>
          </IconTooltip>
        </div>
      </div>
    </header>
  );
}

function cloudSyncStatus(t: Messages, status: SyncWriteStatus | undefined) {
  if (status?.lastError) {
    return {
      label: t.options.syncWriteError,
      className: "error",
      Icon: CloudOff,
    };
  }
  if ((status?.activeCount || 0) > 0) {
    return {
      label: t.options.syncWriteSyncing,
      className: "syncing",
      Icon: CloudUpload,
    };
  }
  if ((status?.pendingCount || 0) > 0) {
    return {
      label: `${t.options.syncWritePending} · ${t.options.syncWritePendingDetail.replace("{count}", String(status?.pendingCount || 0))}`,
      className: "pending",
      Icon: CloudUpload,
    };
  }
  if (status?.lastFlushedAt) {
    return {
      label: t.options.syncWriteIdle,
      className: "synced",
      Icon: CloudCheck,
    };
  }
  return { label: t.options.syncWriteIdle, className: "idle", Icon: Cloud };
}
