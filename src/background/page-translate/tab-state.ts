import { getMessages } from "../../shared/i18n";
import { CONTEXT_MENU_ID } from "../../shared/context-menu";
import {
  PAGE_TRANSLATE_MESSAGE,
  type PageTranslateQueryMessage,
} from "../../shared/page-translate/protocol";
import { getBrowserApi } from "../../shared/browser-api";
import { sessionRecord } from "../../shared/session-record";
import { storage } from "../../shared/storage";
import { STORAGE_KEYS } from "../../shared/storage-keys";

// Which tabs show a translated page, for the menu item's title: "Translate
// this page", or "Show original" there. Kept in session storage too, so a
// restarted service worker still knows.
const translatedTabs = sessionRecord<number[]>(
  STORAGE_KEYS.pageTranslateTabs,
  () => [],
);

export async function setTabTranslated(tabId: number, value: boolean) {
  let changed = false;
  await translatedTabs
    .update((tabs) => {
      const next = new Set(Array.isArray(tabs) ? tabs : []);
      changed = next.has(tabId) !== value;
      if (value) next.add(tabId);
      else next.delete(tabId);
      return [...next];
    })
    .catch(() => undefined);
  if (changed) await refreshMenuTitle();
}

async function isTabTranslated(tabId: number | undefined) {
  if (tabId === undefined) return false;
  const tabs = await translatedTabs.get();
  return Array.isArray(tabs) && tabs.includes(tabId);
}

// The item's title for the active tab.
export async function translateMenuTitle(language?: string) {
  const [tab] = await getBrowserApi()
    .tabs.query({ active: true, lastFocusedWindow: true })
    .catch(() => []);
  const messages = getMessages(
    language ?? (await storage.language.get()),
  ).pageTranslate;
  return (await isTabTranslated(tab?.id))
    ? messages.menu.showOriginal
    : messages.menu.translatePage;
}

async function refreshMenuTitle() {
  const menus = getBrowserApi().contextMenus;
  if (!menus) return;
  const title = (await translateMenuTitle()).replaceAll("&", "&&");
  await new Promise<void>((resolve) =>
    menus.update(CONTEXT_MENU_ID.translatePage, { title }, () => {
      // The item is missing while the menu or the item is turned off.
      void getBrowserApi().runtime.lastError;
      resolve();
    }),
  );
}

export function watchTabs() {
  const api = getBrowserApi();
  const refresh = () => void refreshMenuTitle().catch(() => undefined);
  api.tabs.onActivated.addListener(refresh);
  api.windows?.onFocusChanged.addListener(refresh);
  api.tabs.onRemoved.addListener(
    (tabId) => void setTabTranslated(tabId, false).catch(() => undefined),
  );
  // After a navigation the page there says whether it is translated: a new
  // page isn't, a same-document navigation or a page restored from the
  // back/forward cache may be.
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status !== "complete" && change.url === undefined) return;
    void queryTab(tabId)
      .then((value) => setTabTranslated(tabId, value))
      .catch(() => undefined);
  });
  // Firefox updates an open menu before it shows.
  const menus = api.contextMenus as typeof chrome.contextMenus & {
    onShown?: { addListener(listener: () => void): void };
    refresh?: () => void;
  };
  menus?.onShown?.addListener(() => {
    void refreshMenuTitle().then(() => menus.refresh?.());
  });
}

// Whether the tab's page is translated; false where it has no page script.
async function queryTab(tabId: number) {
  const message: PageTranslateQueryMessage = {
    type: PAGE_TRANSLATE_MESSAGE.query,
  };
  const response = await getBrowserApi()
    .tabs.sendMessage(tabId, message, { frameId: 0 })
    .catch(() => undefined);
  return (
    (response as { translated?: boolean } | undefined)?.translated === true
  );
}
