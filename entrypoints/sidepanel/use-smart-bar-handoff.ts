import { useEffect, useRef, useState, type RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  SMART_BAR_HANDOFF_TTL_MS,
  smartBarHandoffStorage,
} from "../../src/shared/smart-bar-handoff";
import type { SmartBarHandoff } from "../../src/shared/smart-bar-protocol";
import { getBrowserApi } from "../../src/shared/storage";
import type { Chat } from "../../src/shared/types";
import { composerWithQuote, smartBarHandoffChat } from "./smart-bar-handoff";

// Picks up what the smart bar sent to this window's side panel: a selection
// to ask about (quoted into the composer, not sent) or an action's result to
// continue in a new chat. Applied once the chat list has loaded.
export function useSmartBarHandoff({
  ready,
  t,
  input,
  setInput,
  importChat,
  composerRef,
}: {
  ready: boolean;
  t: Messages;
  input: string;
  setInput: (value: string) => void;
  importChat: (chat: Chat) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [handoff, setHandoff] = useState<SmartBarHandoff>();
  const appliedRef = useRef(new Set<string>());

  useEffect(() => {
    const { area, name, key } = smartBarHandoffStorage();
    let active = true;
    const take = async () => {
      const stored = (await area.get(key))[key] as SmartBarHandoff | undefined;
      if (!active || !stored) return;
      if (Date.now() - stored.createdAt > SMART_BAR_HANDOFF_TTL_MS)
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
    if (handoff.result)
      importChat(
        smartBarHandoffChat({ ...handoff, result: handoff.result }, t),
      );
    else setInput(composerWithQuote(input, handoff));
    requestAnimationFrame(() => {
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      composer.setSelectionRange(composer.value.length, composer.value.length);
    });
  }, [composerRef, handoff, importChat, input, ready, setInput, t]);
}

// A side panel belongs to one window; the panel page opened as a tab
// (browsers without a side panel) takes any handoff.
async function isForThisPanel(handoff: SmartBarHandoff) {
  const api = getBrowserApi();
  if (handoff.windowId === undefined || (await api.tabs.getCurrent()))
    return true;
  return (await api.windows.getCurrent()).id === handoff.windowId;
}
