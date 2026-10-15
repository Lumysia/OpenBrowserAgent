import {
  PAGE_TRANSLATE_MESSAGE,
  type PageTranslateStateMessage,
} from "../shared/page-translate/protocol";
import { setPageTranslateShared } from "../shared/page-translate/button";
import { getBrowserApi } from "../shared/browser-api";
import {
  claimPageScript,
  isExtensionContextValid,
} from "../shared/extension-context";
import { createController } from "./controller";

const INSTALLED = Symbol.for("oba.pageTranslate");

// Installed once per page (the background injects it again when it isn't
// sure); answers the background's toggle and query messages. A copy left
// behind by an earlier version of the extension gives the page back its
// original when this one starts.
export function installPageTranslate() {
  const scope = globalThis as { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;
  const report = (translated: boolean) => {
    if (!isExtensionContextValid()) return;
    const message: PageTranslateStateMessage = {
      type: PAGE_TRANSLATE_MESSAGE.state,
      translated,
    };
    getBrowserApi()
      .runtime.sendMessage(message)
      .catch(() => undefined);
  };
  // The page button (in this world too) follows both.
  const controller = createController(
    (translated) => {
      setPageTranslateShared({ translated, starting: translated });
      report(translated);
    },
    () => setPageTranslateShared({ starting: false }),
  );
  claimPageScript("page-translate", () => controller.stop());
  getBrowserApi().runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      const type = (message as { type?: string } | undefined)?.type;
      if (type === PAGE_TRANSLATE_MESSAGE.toggle) controller.toggle();
      else if (type === PAGE_TRANSLATE_MESSAGE.start) controller.start();
      else if (type !== PAGE_TRANSLATE_MESSAGE.query) return false;
      sendResponse({ translated: controller.active });
      return false;
    },
  );
  // A translated page back from the back/forward cache is still translated.
  addEventListener("pageshow", (event) => {
    if (event.persisted && controller.active) report(true);
  });
}
