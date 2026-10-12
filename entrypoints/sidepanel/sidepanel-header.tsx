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
import { storage, type SyncStatus } from "../../src/shared/storage";
import { NO_SYNC_BACKEND_ID } from "../../src/shared/sync-backends";
import { useStoredState } from "../../src/ui/useStoredState";
import { describeSyncStatus, type SyncTone } from "../../src/ui/sync-status";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { ChatMeta } from "../../src/shared/types";
import { chatDisplayTitle } from "../../src/ui/agent-display";
import { Button, IconTooltip } from "../../src/ui/components";

export function SidepanelHeader({
  t,
  currentChat,
  parentChat,
  syncStatus,
  onCreateChat,
  onSetShowHistory,
  onSelectChat,
}: {
  t: Messages;
  currentChat?: ChatMeta;
  parentChat?: ChatMeta;
  syncStatus?: SyncStatus;
  onCreateChat: () => void;
  onSetShowHistory: (value: boolean) => void;
  onSelectChat: (chatId: string) => void;
}) {
  const [activeSyncBackendId] = useStoredState(storage.activeSyncBackendId);
  const cloudStatus = cloudSyncStatus(
    t,
    syncStatus,
    !!activeSyncBackendId && activeSyncBackendId !== NO_SYNC_BACKEND_ID,
  );
  const SyncIcon = cloudStatus.Icon;
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
          <IconTooltip label={cloudStatus.label}>
            <Button
              variant="ghost"
              size="icon"
              className={`cloud-sync-button ${cloudStatus.className}`}
              aria-label={cloudStatus.label}
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

const CLOUD_ICONS: Record<SyncTone, typeof Cloud> = {
  off: Cloud,
  idle: Cloud,
  synced: CloudCheck,
  syncing: CloudUpload,
  pending: CloudUpload,
  paused: CloudOff,
  error: CloudOff,
};

function cloudSyncStatus(
  t: Messages,
  status: SyncStatus | undefined,
  enabled: boolean,
) {
  const { tone, label } = describeSyncStatus(t, status, enabled);
  return { label, className: tone, Icon: CLOUD_ICONS[tone] };
}
