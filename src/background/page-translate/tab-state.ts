import {
  PAGE_TRANSLATE_MESSAGE,
  type PageTranslateQueryMessage,
} from "../../shared/page-translate/protocol";
import { getBrowserApi } from "../../shared/browser-api";
import { sessionRecord } from "../../shared/session-record";
import { STORAGE_KEYS } from "../../shared/storage-keys";
import { pageToolsChanged } from "../page-tools-events";

// Which tabs show a translated page, for the menu items' titles: "Translate
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
  if (changed) pageToolsChanged();
}

export async function isTabTranslated(tabId: number | undefined) {
  if (tabId === undefined) return false;
  const tabs = await translatedTabs.get();
  return Array.isArray(tabs) && tabs.includes(tabId);
}

export function watchTabs() {
  const api = getBrowserApi();
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
