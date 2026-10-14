import { getPageTranslateMessages } from "../../shared/page-translate/messages";
import {
  PAGE_TRANSLATE_MESSAGE,
  PAGE_TRANSLATE_PORT,
  PAGE_TRANSLATE_SCRIPT,
  PAGE_TRANSLATE_TOAST_MS,
  type PageTranslateEvent,
  type PageTranslateRequest,
  type PageTranslateStartMessage,
  type PageTranslateStateMessage,
  type PageTranslateToggleMessage,
  type PageTranslateView,
} from "../../shared/page-translate/protocol";
import { normalizePageTranslateSettings } from "../../shared/page-translate/settings";
import { getBrowserApi, storage } from "../../shared/storage";
import { flashBadge, showPageNote } from "../page-feedback";
import { pageToastTheme } from "../page-toast";
import { startVideoSubtitles, stopVideoSubtitles } from "../video-subtitles";
import { createPageSession } from "./session";
import { setTabTranslated, watchTabs } from "./tab-state";
import { watchTranslateMode, type TranslateMode } from "./translate-mode";

export { translateMenuTitle } from "./tab-state";

type Sender = chrome.runtime.MessageSender;

const ports = new Set<chrome.runtime.Port>();
let translateMode: TranslateMode | undefined;

export function setupPageTranslate() {
  watchTabs();
  translateMode = watchTranslateMode(startPageTranslation);
  getBrowserApi().runtime.onConnect.addListener((port) => {
    if (port.name === PAGE_TRANSLATE_PORT) handlePort(port);
  });
  // Translated pages follow the display settings at once. Every change is
  // sent: the first one after the worker starts has nothing to compare with.
  let announced: string | undefined;
  storage.preferences.watch((preferences) => {
    const { display, translateMenus } = normalizePageTranslateSettings(
      preferences.pageTranslate,
    );
    const view: PageTranslateView = { display, translateMenus };
    const key = JSON.stringify(view);
    if (key === announced) return;
    announced = key;
    const event: PageTranslateEvent = { type: "view", view };
    for (const port of ports) port.postMessage(event);
  });
}

// Page messages; false for other messages.
export function handlePageTranslateMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (response: unknown) => void,
) {
  const request = (message || {}) as Partial<PageTranslateStateMessage>;
  if (request.type !== PAGE_TRANSLATE_MESSAGE.state) return false;
  const tabId = sender.tab?.id;
  if (tabId !== undefined && !sender.frameId)
    void setTabTranslated(tabId, request.translated === true).finally(() =>
      sendResponse({ ok: true }),
    );
  else sendResponse({ ok: true });
  return true;
}

// "Translate this page" and "Show original": the page script knows which
// one it is and tells the background (see handlePageTranslateMessage). It
// is injected the first time. The tab's translate mode follows the answer.
// When it can't be started the page says why, or the toolbar button where
// the page can't be scripted.
export async function togglePageTranslation(tab: chrome.tabs.Tab | undefined) {
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  const message: PageTranslateToggleMessage = {
    type: PAGE_TRANSLATE_MESSAGE.toggle,
  };
  const { injected, translated } = await messagePage(tabId, message);
  if (translated !== undefined) {
    // The page's videos follow: their subtitles are translated too.
    await Promise.all([
      translateMode?.set(tabId, translated),
      translated ? startVideoSubtitles(tabId) : stopVideoSubtitles(tabId),
    ]);
    return;
  }
  const [language, preferences] = await Promise.all([
    storage.language.get(),
    storage.preferences.get(),
  ]);
  const messages = getPageTranslateMessages(language);
  const noted =
    injected &&
    (await showPageNote(
      tabId,
      messages.notStarted,
      pageToastTheme(preferences.colorScheme, preferences.accentColor),
      { tone: "error", durationMs: PAGE_TRANSLATE_TOAST_MS },
    ));
  if (!noted) await flashBadge(tabId, messages.unavailablePage);
}

// A later page in a tab in translate mode; quietly nothing where the page
// can't be translated.
async function startPageTranslation(tabId: number) {
  const message: PageTranslateStartMessage = {
    type: PAGE_TRANSLATE_MESSAGE.start,
  };
  const { translated } = await messagePage(tabId, message);
  if (translated !== undefined) await setTabTranslated(tabId, translated);
}

// Sends `message` to the tab's page script, injecting the script when it
// isn't there yet. `translated`: the page's answer; undefined when the page
// script couldn't be reached.
async function messagePage(
  tabId: number,
  message: PageTranslateToggleMessage | PageTranslateStartMessage,
) {
  const api = getBrowserApi();
  // Only the page translation script answers with its state. Other scripts
  // in the page (the smart bar) also receive the message and the browser
  // then reports "delivered" with no answer, so an empty reply means the
  // script isn't there yet.
  const send = () =>
    api.tabs.sendMessage(tabId, message, { frameId: 0 }).then(
      (reply: unknown) => {
        const translated = (reply as { translated?: unknown } | undefined)
          ?.translated;
        return typeof translated === "boolean" ? translated : undefined;
      },
      () => undefined,
    );
  const first = await send();
  if (first !== undefined) return { injected: false, translated: first };
  const injected = await api.scripting
    .executeScript({
      target: { tabId, frameIds: [0] },
      files: [PAGE_TRANSLATE_SCRIPT],
    })
    .then(
      () => true,
      () => false,
    );
  return { injected, translated: injected ? await send() : undefined };
}

function handlePort(port: chrome.runtime.Port) {
  const controller = new AbortController();
  const post = (event: PageTranslateEvent) => {
    if (!controller.signal.aborted) port.postMessage(event);
  };
  ports.add(port);
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    controller.abort();
  });
  const handle = createPageSession(post, controller.signal);
  port.onMessage.addListener((request: PageTranslateRequest) =>
    handle(request),
  );
}
