import {
  showPageToast,
  type PageToastOptions,
  type PageToastTheme,
} from "../shared/page-toast";
import { getBrowserApi } from "../shared/storage";

// How long the toolbar badge shows.
const BADGE_MS = 4_000;

// A short note on the page (see showPageToast); false where the page can't
// be scripted.
export function showPageNote(
  tabId: number,
  message: string,
  theme: PageToastTheme,
  options: PageToastOptions,
) {
  return getBrowserApi()
    .scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: showPageToast,
      args: [message, theme, options],
    })
    .then(
      () => true,
      () => false,
    );
}

// A short note on the toolbar button, for pages that can't be scripted.
export async function flashBadge(tabId: number, title: string) {
  const api = getBrowserApi();
  const action = api.action ?? (api as typeof chrome).browserAction;
  if (!action) return;
  const defaultTitle =
    api.runtime.getManifest().action?.default_title || "OpenBrowserAgent";
  await action.setBadgeText({ tabId, text: "!" });
  await action.setTitle({ tabId, title });
  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    void action.setTitle({ tabId, title: defaultTitle }).catch(() => undefined);
  }, BADGE_MS);
}
