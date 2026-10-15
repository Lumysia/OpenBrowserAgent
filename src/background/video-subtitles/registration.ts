import { getBrowserApi } from "../../shared/browser-api";
import { PAGE_SCRIPT, REGISTERED_SCRIPT_ID } from "../../shared/page-scripts";

const SCRIPT_ID = REGISTERED_SCRIPT_ID.videoButton;
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
      js: [PAGE_SCRIPT.videoButton],
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
              files: [PAGE_SCRIPT.videoButton],
            })
            .catch(() => undefined),
    ),
  );
}
