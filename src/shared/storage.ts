import { nanoid } from "nanoid";
import type {
  Chat,
  ChatTab,
  Preferences,
  ProviderState,
  QuickAction,
} from "./types";

type AreaName = "local" | "sync";

type StorageItem<T> = {
  key: string;
  area: AreaName;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

function getBrowserApi() {
  const apiGlobal = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return apiGlobal.browser ?? apiGlobal.chrome ?? chrome;
}

function createItem<T>(
  area: AreaName,
  key: string,
  init: () => T,
): StorageItem<T> {
  const storageKey = key;
  const storageArea = () => getBrowserApi().storage[area];

  return {
    key: storageKey,
    area,
    async get() {
      const result = await storageArea().get(storageKey);
      if (result[storageKey] === undefined) {
        const initialValue = init();
        await storageArea().set({ [storageKey]: initialValue });
        return initialValue;
      }
      return result[storageKey] as T;
    },
    async set(value) {
      await storageArea().set({ [storageKey]: value });
    },
    async remove() {
      await storageArea().remove(storageKey);
    },
    watch(callback) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        if (changedArea !== area || !changes[storageKey]) return;
        callback(
          changes[storageKey].newValue as T,
          changes[storageKey].oldValue as T,
        );
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

export const storage = {
  userId: createItem<string>("local", "userId", () => nanoid()),
  language: createItem<string>(
    "sync",
    "language",
    () => getBrowserApi().i18n?.getUILanguage?.() || "en-US",
  ),
  provider: createItem<ProviderState>("local", "provider", () => ({})),
  preferences: createItem<Preferences>("local", "preferences", () => ({
    colorScheme: "system",
    accentColor: "amber",
    autoScroll: true,
  })),
  quickAction: createItem<QuickAction[]>("local", "quick-action", () => []),
  shouldShowUpdateToast: createItem<boolean>(
    "local",
    "should-show-update-toast",
    () => false,
  ),
  chats: createItem<Chat[]>("local", "chats", () => []),
  chatTabs: createItem<ChatTab[]>("local", "chat-tabs", () => []),
};

export async function updateStoredArray<T extends { id: string }>(
  item: StorageItem<T[]>,
  updater: (items: T[]) => T[],
) {
  const items = await item.get();
  const next = updater(items);
  await item.set(next);
  return next;
}
