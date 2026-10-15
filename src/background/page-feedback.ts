import { PRODUCT_NAME } from "../shared/config";
import {
  PAGE_TOAST_GLOBAL,
  PAGE_TOAST_SCRIPT,
  type PageToastOptions,
  type PageToastTheme,
} from "../shared/page-toast";
import { getBrowserApi } from "../shared/browser-api";

// How long the toolbar badge shows.
const BADGE_MS = 4_000;

// A short note on the page (see src/page-toast): the page script that draws
// it goes in first. False where the page can't be scripted.
export async function showPageNote(
  tabId: number,
  message: string,
  theme: PageToastTheme,
  options: PageToastOptions,
) {
  const { scripting } = getBrowserApi();
  const target = { tabId, frameIds: [0] };
  try {
    await scripting.executeScript({ target, files: [PAGE_TOAST_SCRIPT] });
    const [result] = await scripting.executeScript({
      target,
      func: callPageToast,
      args: [PAGE_TOAST_GLOBAL, message, theme, options],
    });
    return result?.result === true;
  } catch {
    return false;
  }
}

// Runs in the page (serialized, so self-contained).
function callPageToast(
  name: string,
  message: string,
  theme: PageToastTheme,
  options: PageToastOptions,
) {
  const show = (globalThis as Record<string, unknown>)[name];
  if (typeof show !== "function") return false;
  show(message, theme, options);
  return true;
}

// A short note on the toolbar button, for pages that can't be scripted.
export async function flashBadge(tabId: number, title: string) {
  const api = getBrowserApi();
  const action = api.action ?? (api as typeof chrome).browserAction;
  if (!action) return;
  const defaultTitle =
    api.runtime.getManifest().action?.default_title || PRODUCT_NAME;
  await action.setBadgeText({ tabId, text: "!" });
  await action.setTitle({ tabId, title });
  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    void action.setTitle({ tabId, title: defaultTitle }).catch(() => undefined);
  }, BADGE_MS);
}
