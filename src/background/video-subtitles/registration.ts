import { PAGE_SCRIPT, REGISTERED_SCRIPT_ID } from "../../shared/page-scripts";
import { normalizePageTranslateSettings } from "../../shared/page-translate/settings";
import { webPagesExcept } from "../../shared/site-hosts";
import { registerWhile } from "../content-script-registration";

// The video button's script, in every frame (videos are often embedded)
// while the button is on. Where the browser can't register it, the menu
// and "Translate this page" still translate subtitles.
export function registerVideoButton() {
  registerWhile(
    {
      id: REGISTERED_SCRIPT_ID.videoButton,
      file: PAGE_SCRIPT.videoButton,
      allFrames: true,
    },
    (preferences) =>
      normalizePageTranslateSettings(preferences.pageTranslate).videoButton
        ? webPagesExcept([])
        : undefined,
  );
}
