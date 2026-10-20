import { TeachCard } from "./teach/teach-card";
import { useRef, type RefObject } from "react";
import { TOOLTIP_DELAY_MS } from "../../src/shared/config";
import { TooltipProvider } from "../../src/ui/components";
import { cn } from "../../src/ui/utils";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerBox } from "./composer-box";
import { EditModeOverlay } from "./edit-mode-overlay";
import { HistoryPanel } from "./history-panel";
import { MessageJumpControls } from "./message-jump-controls";
import { MessageBubble } from "./message-bubble";
import { NoModelState } from "./no-model-state";
import { QueuedMessages } from "./queued-messages";
import { SidepanelHeader } from "./sidepanel-header";
import { SyncKeysBanner } from "./sync-keys-banner";
import { TypingIndicator } from "./typing-indicator";
import { HolidayBurst } from "./holiday-touches";
import { useChat, useComposer } from "./sidepanel-providers";
import { UploadFileInput } from "./uploaded-attachment-card";
import { useDeferredPresence } from "./use-deferred-remove";
import { ChatContentStatus } from "./chat-content-status";
import { useNavigation } from "./sidepanel-navigation";
import { TasksPanel } from "./tasks/tasks-panel";

export function SidepanelView({
  modelCount,
  messagesRef,
}: {
  modelCount: number;
  messagesRef: RefObject<HTMLDivElement | null>;
}) {
  const navigation = useNavigation();
  const { view } = navigation;
  const chat = useChat();
  const composer = useComposer();
  if (modelCount === 0) return <NoModelState />;
  if (view.name === "tasks")
    return (
      <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
        <div className="sidepanel history-mode">
          <TasksPanel
            agents={composer.agents}
            defaultAgentId={chat.agent.id}
            pageUrl={composer.attachedTabs[0]?.url}
            draft={view.draft}
            onOpenChat={(chatId) => {
              chat.selectChat(chatId);
              navigation.showChat();
            }}
            onBack={navigation.showChat}
          />
        </div>
      </TooltipProvider>
    );
  if (view.name === "history")
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
            onBack={navigation.showChat}
            onSelect={(chatId) => {
              chat.selectChat(chatId);
              navigation.showChat();
            }}
            onClose={chat.closeChat}
          />
        </div>
      </TooltipProvider>
    );
  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <ChatView messagesRef={messagesRef} />
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
}: {
  messagesRef: RefObject<HTMLDivElement | null>;
}) {
  const navigation = useNavigation();
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
        onShowHistory={navigation.showHistory}
        onShowTasks={() => navigation.showTasks()}
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
        <div className="typing-row">
          {typingPresence.mounted && (
            <TypingIndicator removing={typingPresence.removing} />
          )}
        </div>
        <SyncKeysBanner />
        <ComposerAttachments />
        <QueuedMessages
          messages={composer.queuedMessages}
          onDelete={composer.deleteQueuedMessage}
          onEdit={composer.editQueuedMessage}
        />
        {composer.consentPrompt}
        <TeachCard />
        <ComposerBox onPickFiles={() => fileInputRef.current?.click()} />
      </footer>
    </div>
  );
}
