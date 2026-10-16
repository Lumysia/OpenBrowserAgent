import { getBrowserApi } from "../shared/browser-api";
import { readSetupFinished, watchSetupFinished } from "../shared/setup-gate";
import { TOOLBAR_MENU_PAGE } from "../shared/side-panel";

// Whether setup is finished, as the background last read it; undefined in a
// worker that just started (for the click that woke it) until it has.
let finished: boolean | undefined;

// Once setup is finished the toolbar button (and its shortcut) opens the
// toolbar menu as its popup; until then its click comes to
// openActionSurface. The background sets it each time it starts, so it
// matches setup after a browser restart too.
function apply(value: boolean) {
  finished = value;
  const api = getBrowserApi();
  return (api.action ?? api.browserAction)
    ?.setPopup({ popup: value ? TOOLBAR_MENU_PAGE : "" })
    ?.catch(console.warn);
}

export function setupSetupGate() {
  // The menu opens instead of the panel (before the menu, the panel opened
  // by itself).
  getBrowserApi()
    .sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false })
    .catch(console.warn);
  readSetupFinished().then(apply).catch(console.warn);
  watchSetupFinished(apply);
}

export function knownSetupFinished() {
  return finished;
}

// Whether setup is finished, read again where the background doesn't know
// yet; the popup is set once it resolves.
export async function setupFinished() {
  if (finished === undefined) await apply(await readSetupFinished());
  return finished!;
}
