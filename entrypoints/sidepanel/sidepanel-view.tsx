import { Plus } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { TOOLTIP_DELAY_MS } from "../../src/shared/config";
import { Button, TooltipProvider } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { cn } from "../../src/ui/utils";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerBox } from "./composer-box";
import { EditModeOverlay } from "./edit-mode-overlay";
import { HistoryPanel } from "./history-panel";
import { MessageJumpControls } from "./message-jump-controls";
import { MessageBubble } from "./message-bubble";
import { ProvidersEmptyState } from "./providers-empty-state";
import { QueuedMessages } from "./queued-messages";
import { SidepanelHeader } from "./sidepanel-header";
import { TypingIndicator } from "./typing-indicator";
import { HolidayBurst } from "./holiday-touches";
import { useChat, useComposer } from "./sidepanel-providers";
import { UploadFileInput } from "./uploaded-attachment-card";
import { useDeferredPresence } from "./use-deferred-remove";
import { ChatContentStatus } from "./chat-content-status";

export function SidepanelView({
  modelCount,
  messagesRef,
}: {
  modelCount: number;
  messagesRef: RefObject<HTMLDivElement | null>;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const chat = useChat();
  if (modelCount === 0) return <ProvidersEmptyState />;
  if (showHistory)
    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <div className="sidepanel history-mode">
          <HistoryPanel
            chats={chat.chats}
            activeChatId={currentMeta(chat)?.id}
            unreadCompletedChatIds={chat.unreadCompletedChatIds}
            agent={chat.agent}
            onSetChats={chat.setChats}
            onLoadChat={chat.loadChat}
            onImportChat={chat.importChat}
            onBack={() => setShowHistory(false)}
            onSelect={(chatId) => {
              chat.selectChat(chatId);
              setShowHistory(false);
            }}
            onClose={chat.closeChat}
          />
        </div>
      </TooltipProvider>
    );
  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <ChatView
        messagesRef={messagesRef}
        onShowHistory={() => setShowHistory(true)}
      />
    </TooltipProvider>
  );
}

// The open chat's list entry stands in while its content loads.
function currentMeta({
  currentChat,
  chats,
  activeChatId,
}: ReturnType<typeof useChat>) {
  return currentChat ?? chats.find((chat) => chat.id === activeChatId);
}

function ChatView({
  messagesRef,
  onShowHistory,
}: {
  messagesRef: RefObject<HTMLDivElement | null>;
  onShowHistory: () => void;
}) {
  const t = useMessages();
  const chat = useChat();
  const composer = useComposer();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingPresence = useDeferredPresence(chat.streaming);
  const { currentChat, chats, editingMessageId, streaming } = chat;
  const meta = currentMeta(chat);
  const parentChat = meta?.parentChatId
    ? chats.find((item) => item.id === meta.parentChatId)
    : undefined;
  const latestUserMessageId = [...(currentChat?.messages || [])]
    .reverse()
    .find((message) => message.role === "user")?.id;
  const lastMessageId = currentChat?.messages.at(-1)?.id;
  const messagesKey = currentChat?.messages.length ? currentChat.id : "empty";

  return (
    <div className={cn("sidepanel", editingMessageId && "editing-mode")}>
      <SidepanelHeader
        currentChat={meta}
        parentChat={parentChat}
        onCreateChat={chat.createChat}
        onShowHistory={onShowHistory}
        onSelectChat={chat.selectChat}
      />
      {editingMessageId && (
        <EditModeOverlay onCancel={chat.cancelEditMessage} />
      )}
      <div className="messages-shell">
        <div key={messagesKey} ref={messagesRef} className="messages">
          <div className="messages-content">
            <ChatContentStatus
              status={chat.currentChatStatus}
              empty={!currentChat?.messages.length}
              onRetry={chat.retryChat}
            />
            {currentChat?.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                latestUserMessage={message.id === latestUserMessageId}
                editing={editingMessageId === message.id}
                sources={currentChat.sources}
                chats={chats}
                chatMessages={currentChat.messages}
                outputActive={message.id === chat.activeAssistantMessageId}
                runStopped={chat.stoppedRuns.has(message.id)}
                onContinue={
                  message.id === lastMessageId && !streaming
                    ? chat.continueChat
                    : undefined
                }
                sentAttachments={chat.sentAttachmentPreviews[message.id] || []}
                activeAttachments={chat.activeAttachments}
                onReplaceAttachment={chat.replaceAttachment}
                onEdit={chat.editMessage}
                onResend={chat.resendMessage}
                resendDisabled={streaming}
                onFork={chat.forkMessage}
                onSelectChat={chat.selectChat}
                onAnswerQuestion={chat.answerQuestion}
              />
            ))}
          </div>
        </div>
        <MessageJumpControls
          currentChat={currentChat}
          editingMessageId={editingMessageId}
          messagesRef={messagesRef}
          stoppedRuns={chat.stoppedRuns}
        />
      </div>
      <footer className="composer">
        <UploadFileInput
          inputRef={fileInputRef}
          onAttachFiles={composer.attachFiles}
        />
        <HolidayBurst />
        <div className="new-chat-row">
          {typingPresence.mounted && (
            <TypingIndicator removing={typingPresence.removing} />
          )}
          <Button
            className="new-chat-button"
            variant="secondary"
            size="sm"
            disabled={!!editingMessageId}
            onClick={chat.createChat}
          >
            <Plus size={16} /> {t.words.newChat}
          </Button>
        </div>
        <ComposerAttachments />
        <QueuedMessages
          messages={composer.queuedMessages}
          onDelete={composer.deleteQueuedMessage}
          onEdit={composer.editQueuedMessage}
        />
        {composer.consentPrompt}
        <ComposerBox onPickFiles={() => fileInputRef.current?.click()} />
      </footer>
    </div>
  );
}
