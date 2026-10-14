import { getMessages } from "../../shared/i18n";
import { CONTEXT_MENU_ID } from "../../shared/context-menu";
import {
  PAGE_TRANSLATE_MESSAGE,
  type PageTranslateQueryMessage,
} from "../../shared/page-translate/protocol";
import { getBrowserApi, storage } from "../../shared/storage";

// Which tabs show a translated page, for the menu item's title: "Translate
// this page", or "Show original" there. Kept in session storage too, so a
// restarted service worker still knows.
const SESSION_KEY = "page-translate-tabs";

let translated: Promise<Set<number>> | undefined;

function translatedTabs() {
  translated ??= (async () => {
    const area = getBrowserApi().storage.session;
    const values: Record<string, unknown> = area
      ? await area.get(SESSION_KEY).catch(() => ({}))
      : {};
    const stored = values[SESSION_KEY];
    return new Set(Array.isArray(stored) ? stored : []);
  })();
  return translated;
}

export async function setTabTranslated(tabId: number, value: boolean) {
  const tabs = await translatedTabs();
  if (tabs.has(tabId) === value) return;
  if (value) tabs.add(tabId);
  else tabs.delete(tabId);
  await getBrowserApi()
    .storage.session?.set({ [SESSION_KEY]: [...tabs] })
    .catch(() => undefined);
  await refreshMenuTitle();
}

export async function isTabTranslated(tabId: number | undefined) {
  return tabId !== undefined && (await translatedTabs()).has(tabId);
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

export async function refreshMenuTitle() {
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
export async function queryTab(tabId: number) {
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
