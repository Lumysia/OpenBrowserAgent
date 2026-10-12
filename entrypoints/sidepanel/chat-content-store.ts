import {
  chatContentKey,
  contentFacts,
  loadChatContent,
  refreshChatContent,
  saveChatContent,
} from "../../src/shared/chat-storage";
import {
  chatContentSnapshot,
  chatFacts,
  normalizeChatContent,
  reconcileChatContent,
} from "../../src/shared/chats";
import {
  CHAT_STREAM_WRITE_DEBOUNCE_MS,
  CHAT_WRITE_DEBOUNCE_MS,
} from "../../src/shared/config";
import { SplitItemUnavailableError } from "../../src/shared/storage-split";
import type { ChatContent } from "../../src/shared/types";

export type ChatContentEntry =
  | { status: "loading" }
  // `unavailable`: the content is on neither this device nor the cloud.
  | { status: "error"; unavailable: boolean }
  | { status: "ready"; content: ChatContent };

type Facts = ReturnType<typeof chatFacts>;
type PersistMode = "debounced" | "immediate";

const OWN_WRITE_LIMIT = 4;

// Contents of the chats this page uses (the open chat and chats still
// streaming), loaded on demand. Each chat persists on its own, so a change
// rewrites only that chat and notifies only its subscribers.
export function createChatContentStore(
  onFacts: (chatId: string, facts: Facts) => void,
) {
  const entries = new Map<string, ChatContentEntry>();
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const ownWrites = new Map<string, string[]>();

  function notify(chatId: string) {
    listeners.get(chatId)?.forEach((listener) => listener());
  }

  function setEntry(chatId: string, entry: ChatContentEntry) {
    entries.set(chatId, entry);
    notify(chatId);
  }

  function content(chatId: string) {
    const entry = entries.get(chatId);
    return entry?.status === "ready" ? entry.content : undefined;
  }

  async function persist(chatId: string) {
    clearTimeout(timers.get(chatId));
    timers.delete(chatId);
    const current = content(chatId);
    if (!current) return;
    // Recorded before writing: the change event can precede the write's end.
    // (Moving inline images to attachments keeps the snapshot.)
    const snapshots = [
      ...(ownWrites.get(chatId) || []),
      chatContentSnapshot(current),
    ];
    ownWrites.set(chatId, snapshots.slice(-OWN_WRITE_LIMIT));
    const saved = await saveChatContent(chatId, current);
    onFacts(chatId, saved.facts);
  }

  function schedule(chatId: string, mode: PersistMode) {
    clearTimeout(timers.get(chatId));
    if (mode === "immediate") return persist(chatId);
    const delay = chatFacts(content(chatId) ?? { messages: [] }).running
      ? CHAT_STREAM_WRITE_DEBOUNCE_MS
      : CHAT_WRITE_DEBOUNCE_MS;
    timers.set(
      chatId,
      setTimeout(() => {
        persist(chatId).catch((error) =>
          console.warn("Failed to persist chat", error),
        );
      }, delay),
    );
    return Promise.resolve();
  }

  // Another context stored this chat's content (a sync download, a tool).
  function applyStored(chatId: string, value: unknown) {
    const entry = entries.get(chatId);
    if (!entry) return;
    if (value === undefined) {
      entries.delete(chatId);
      notify(chatId);
      return;
    }
    const incoming = normalizeChatContent(value);
    const snapshot = chatContentSnapshot(incoming);
    const own = ownWrites.get(chatId) || [];
    if (own.includes(snapshot)) {
      ownWrites.set(
        chatId,
        own.filter((item) => item !== snapshot),
      );
      return;
    }
    const next = reconcileChatContent(content(chatId), incoming);
    setEntry(chatId, { status: "ready", content: next });
    // Merged content (e.g. from another device) can change the list facts,
    // such as the attachments a chat uses.
    onFacts(chatId, contentFacts(next));
  }

  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local") return;
    for (const chatId of entries.keys()) {
      const change = changes[chatContentKey(chatId)];
      if (change) applyStored(chatId, change.newValue);
    }
  };

  return {
    get: (chatId: string) => entries.get(chatId),
    content,
    subscribe(chatId: string, listener: () => void) {
      const set = listeners.get(chatId) || new Set();
      set.add(listener);
      listeners.set(chatId, set);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(chatId);
      };
    },
    // Load once; a failed load is retried on the next call.
    async load(chatId: string): Promise<ChatContent | undefined> {
      const entry = entries.get(chatId);
      if (entry?.status === "ready") return entry.content;
      if (entry?.status !== "loading") setEntry(chatId, { status: "loading" });
      try {
        const loaded = (await loadChatContent(chatId)) ?? { messages: [] };
        // Set meanwhile (e.g. a new chat) or dropped: keep that.
        if (entries.get(chatId)?.status !== "loading") return content(chatId);
        setEntry(chatId, { status: "ready", content: loaded });
        return loaded;
      } catch (error) {
        if (entries.get(chatId)?.status === "loading")
          setEntry(chatId, {
            status: "error",
            unavailable: error instanceof SplitItemUnavailableError,
          });
        return undefined;
      }
    },
    // Check a loaded chat against the cloud; a newer copy arrives through
    // storage. Skipped while local edits wait to be stored.
    revalidate(chatId: string) {
      if (!content(chatId) || timers.has(chatId)) return;
      refreshChatContent(chatId).catch(() => undefined);
    },
    set(chatId: string, next: ChatContent, mode: PersistMode = "debounced") {
      if (content(chatId) === next) return Promise.resolve();
      setEntry(chatId, { status: "ready", content: next });
      return schedule(chatId, mode);
    },
    // Keep only these chats in memory; the others are stored first.
    retain(chatIds: ReadonlySet<string>) {
      for (const chatId of [...entries.keys()]) {
        if (chatIds.has(chatId) || listeners.has(chatId)) continue;
        const pending = timers.has(chatId);
        (pending ? persist(chatId) : Promise.resolve())
          .catch((error) => console.warn("Failed to persist chat", error))
          .finally(() => {
            if (!chatIds.has(chatId) && !timers.has(chatId))
              entries.delete(chatId);
          });
      }
    },
    drop(chatIds: Iterable<string>) {
      for (const chatId of chatIds) {
        clearTimeout(timers.get(chatId));
        timers.delete(chatId);
        entries.delete(chatId);
        notify(chatId);
      }
    },
    flushAll() {
      return Promise.all([...timers.keys()].map(persist));
    },
    start() {
      chrome.storage.onChanged.addListener(onStorageChanged);
      return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    },
  };
}

export type ChatContentStore = ReturnType<typeof createChatContentStore>;
