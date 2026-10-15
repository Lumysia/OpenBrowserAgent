import { useEffect, useRef, useState, type RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  readSidePanelHandoff,
  SIDE_PANEL_HANDOFF_TTL_MS,
  SIDE_PANEL_TASK,
  sidePanelHandoffStorage,
  type SidePanelHandoff,
} from "../../src/shared/side-panel-handoff";
import {
  isSidePanelRequest,
  sidePanelRequest,
} from "../../src/shared/side-panel-requests";
import { getBrowserApi } from "../../src/shared/browser-api";
import type { AttachmentTab, Chat, SelectedText } from "../../src/shared/types";
import { handoffSelectedText } from "./selected-text";
import { continuedChat } from "./side-panel-handoff";
import { toAttachmentTab } from "./sidepanel-context";

// A request to send in a new chat once that chat is open.
export type HandoffSend = {
  chatId: string;
  content: string;
  instruction: string;
  tabs: AttachmentTab[];
  selectedTexts: SelectedText[];
};

// Picks up what the smart bar or the context menu sent to this window's side
// panel, once the chat list has loaded: a page (and selection) to ask about,
// attached as context with the composer focused; a smart bar result to
// continue in a new chat; or a request (summarize, search the web) sent at
// once in a new chat.
export function useSidePanelHandoff({
  ready,
  t,
  language,
  importChat,
  createChat,
  attachTab,
  attachSelectedText,
  currentChatId,
  canSend,
  send,
  composerRef,
}: {
  ready: boolean;
  t: Messages;
  language: string;
  importChat: (chat: Chat) => void;
  createChat: () => Chat;
  attachTab: (tab: AttachmentTab) => void;
  attachSelectedText: (selection: SelectedText) => void;
  currentChatId: string | undefined;
  canSend: boolean;
  send: (request: Omit<HandoffSend, "chatId">) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [handoff, setHandoff] = useState<SidePanelHandoff>();
  const [pending, setPending] = useState<HandoffSend>();
  const appliedRef = useRef(new Set<string>());

  useEffect(() => {
    const { area, name, key } = sidePanelHandoffStorage();
    let active = true;
    const take = async () => {
      const value = (await area.get(key))[key];
      if (!active || !value) return;
      const stored = readSidePanelHandoff(value);
      if (!stored || Date.now() - stored.createdAt > SIDE_PANEL_HANDOFF_TTL_MS)
        return area.remove(key);
      if (!(await isForThisPanel(stored))) return;
      await area.remove(key);
      if (active) setHandoff(stored);
    };
    void take();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === name && changes[key]?.newValue) void take();
    };
    const api = getBrowserApi();
    api.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      api.storage.onChanged.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    if (!handoff || !ready || appliedRef.current.has(handoff.id)) return;
    appliedRef.current.add(handoff.id);
    setHandoff(undefined);
    const focusComposer = () =>
      requestAnimationFrame(() => {
        const composer = composerRef.current;
        if (!composer) return;
        composer.focus();
        composer.setSelectionRange(
          composer.value.length,
          composer.value.length,
        );
      });
    if (handoff.task === SIDE_PANEL_TASK.continue) {
      importChat(continuedChat(handoff, t));
      focusComposer();
      return;
    }
    void handoffTab(handoff).then((tab) => {
      const selection = handoffSelectedText(handoff, tab);
      if (handoff.task === SIDE_PANEL_TASK.ask) {
        if (tab) attachTab(tab);
        if (selection) attachSelectedText(selection);
        focusComposer();
        return;
      }
      if (!isSidePanelRequest(handoff)) return;
      // The linked page is the subject; the page it was on is not attached.
      const tabs =
        tab && handoff.task !== SIDE_PANEL_TASK.summarizeLink ? [tab] : [];
      const request = sidePanelRequest(handoff, t, language, !!tabs.length);
      setPending({
        chatId: createChat().id,
        ...request,
        tabs,
        selectedTexts: selection ? [selection] : [],
      });
    });
  }, [
    attachSelectedText,
    attachTab,
    composerRef,
    createChat,
    handoff,
    importChat,
    language,
    ready,
    t,
  ]);

  useEffect(() => {
    if (!pending || pending.chatId !== currentChatId || !canSend) return;
    setPending(undefined);
    const { chatId: _chatId, ...request } = pending;
    send(request);
  }, [canSend, currentChatId, pending, send]);
}

// The page's tab, when the extension can read it.
async function handoffTab(handoff: SidePanelHandoff) {
  if (handoff.tabId === undefined) return null;
  const tab = await getBrowserApi()
    .tabs.get(handoff.tabId)
    .catch(() => undefined);
  return toAttachmentTab(
    tab ??
      ({
        id: handoff.tabId,
        title: handoff.pageTitle,
        url: handoff.pageUrl,
      } as chrome.tabs.Tab),
  );
}

// The side panel of the window the request came from takes the handoff.
// Where the browser has no side panel, the panel page runs as a tab and
// takes any; elsewhere such a tab takes none.
async function isForThisPanel(handoff: SidePanelHandoff) {
  const api = getBrowserApi() as typeof chrome & { sidebarAction?: object };
  if (await api.tabs.getCurrent()) return !api.sidePanel && !api.sidebarAction;
  return (
    handoff.windowId === undefined ||
    (await api.windows.getCurrent()).id === handoff.windowId
  );
}
