import { getBrowserApi } from "../shared/browser-api";
import { readSetupFinished, watchSetupFinished } from "../shared/setup-gate";

// Whether setup is finished, as the background last read it; undefined in a
// worker that just started (for the click that woke it) until it has.
let finished: boolean | undefined;

function apply(value: boolean) {
  finished = value;
  // Once setup is finished the toolbar button (and its shortcut) opens the
  // panel by itself; until then its click comes to openActionSurface.
  getBrowserApi()
    .sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: value })
    .catch(console.warn);
}

export function setupSetupGate() {
  readSetupFinished().then(apply).catch(console.warn);
  watchSetupFinished(apply);
}

export function knownSetupFinished() {
  return finished;
}

// Whether setup is finished, read again where the background doesn't know
// yet.
export async function setupFinished() {
  if (finished === undefined) apply(await readSetupFinished());
  return finished!;
}
