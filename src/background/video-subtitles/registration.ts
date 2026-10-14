import { VIDEO_SUBTITLES_SCRIPT } from "../../shared/video-subtitles/protocol";
import { getBrowserApi } from "../../shared/storage";

const SCRIPT_ID = "oba-video-button";
const MATCHES = ["http://*/*", "https://*/*"];

// The video button's script is registered only while the button is on, in
// every frame (videos are often embedded). Browsers without dynamic
// registration get no button; the menu and "Translate this page" still
// work there.
export async function syncVideoButtonRegistration(on: boolean) {
  const scripting = getBrowserApi().scripting;
  if (!scripting?.registerContentScripts) return;
  const [existing] = await scripting.getRegisteredContentScripts({
    ids: [SCRIPT_ID],
  });
  if (!on) {
    if (existing)
      await scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  if (existing) return;
  await scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      js: [VIDEO_SUBTITLES_SCRIPT.button],
      matches: MATCHES,
      allFrames: true,
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
  // Registration covers pages loaded from now on; open pages get the
  // script here (also after an extension update, which drops the old one).
  const tabs = await getBrowserApi().tabs.query({ url: MATCHES });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? undefined
        : scripting
            .executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: [VIDEO_SUBTITLES_SCRIPT.button],
            })
            .catch(() => undefined),
    ),
  );
}
