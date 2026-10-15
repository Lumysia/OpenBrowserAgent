import { getMessages } from "../../shared/i18n";
import { PAGE_SCRIPT, REGISTERED_SCRIPT_ID } from "../../shared/page-scripts";
import {
  normalizePageButtonPosition,
  PAGE_BUTTON_MESSAGE,
  type PageButtonConfig,
  type PageButtonPositionMessage,
} from "../../shared/page-translate/button";
import {
  hidePageButtonOnHost,
  isPageButtonShownOn,
  normalizePageTranslateSettings,
  pageButtonMatchPatterns,
  type PageTranslateSettings,
} from "../../shared/page-translate/settings";
import { respondWith, type RuntimeReply } from "../../shared/runtime-messages";
import { pageHost } from "../../shared/site-hosts";
import { storage } from "../../shared/storage";
import { registerWhile } from "../content-script-registration";
import { pageToastTheme } from "../page-toast";
import { togglePageTranslation } from ".";

type Sender = chrome.runtime.MessageSender;

// The button's script, in top frames while it is on, except on the sites it
// is hidden on.
export function registerPageButton() {
  registerWhile(
    {
      id: REGISTERED_SCRIPT_ID.pageTranslateButton,
      file: PAGE_SCRIPT.pageTranslateButton,
      allFrames: false,
    },
    (preferences) =>
      pageButtonMatchPatterns(
        normalizePageTranslateSettings(preferences.pageTranslate),
      ),
  );
}

// Page button messages; false for other messages. Only a tab's top frame
// has the button.
export function handlePageButtonMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (reply: RuntimeReply) => void,
) {
  const type = (message as { type?: unknown } | undefined)?.type;
  if (!Object.values<unknown>(PAGE_BUTTON_MESSAGE).includes(type)) return false;
  const host = pageHost(sender.tab?.url);
  if (!sender.tab || sender.frameId || !host) {
    sendResponse({ ok: false, error: "Not a page's top frame" });
    return false;
  }
  switch (type) {
    case PAGE_BUTTON_MESSAGE.config:
      return respondWith(buttonConfig(host), sendResponse);
    case PAGE_BUTTON_MESSAGE.toggle:
      return respondWith(togglePageTranslation(sender.tab), sendResponse);
    case PAGE_BUTTON_MESSAGE.hideOnSite:
      return respondWith(
        updateSettings((settings) => hidePageButtonOnHost(settings, host)),
        sendResponse,
      );
    case PAGE_BUTTON_MESSAGE.hideEverywhere:
      return respondWith(
        updateSettings((settings) => ({ ...settings, pageButton: false })),
        sendResponse,
      );
    default: {
      const { position } = message as Partial<PageButtonPositionMessage>;
      return respondWith(
        storage.pageTranslateButtonPosition.set(
          normalizePageButtonPosition(position),
        ),
        sendResponse,
      );
    }
  }
}

async function buttonConfig(host: string): Promise<PageButtonConfig> {
  const [preferences, language, position] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
    storage.pageTranslateButtonPosition.get(),
  ]);
  const messages = getMessages(language).pageTranslate;
  const settings = normalizePageTranslateSettings(preferences.pageTranslate);
  return {
    enabled: isPageButtonShownOn(settings, host),
    position,
    labels: {
      translate: messages.menu.translatePage,
      showOriginal: messages.menu.showOriginal,
      translating: messages.button.translating,
      hide: messages.button.hide,
      hideOnSite: messages.button.hideOnSite.replace("{site}", host),
      hideEverywhere: messages.button.hideEverywhere,
      move: messages.button.move,
    },
    theme: pageToastTheme(preferences.colorScheme, preferences.accentColor),
  };
}

function updateSettings(
  change: (settings: PageTranslateSettings) => PageTranslateSettings,
) {
  return storage.preferences.update((preferences) => ({
    ...preferences,
    pageTranslate: change(
      normalizePageTranslateSettings(preferences.pageTranslate),
    ),
  }));
}
