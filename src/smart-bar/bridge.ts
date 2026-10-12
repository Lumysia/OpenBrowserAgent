import type {
  SmartBarPageConfig,
  SmartBarShowReason,
} from "../shared/smart-bar-protocol";
import type { SelectionSnapshot } from "./selection";

// The page script and the lazily loaded UI script share the extension's
// isolated world in a frame; the UI registers itself here once mounted.
export type SmartBarUi = {
  // The element holding the bar's closed shadow root.
  host: HTMLElement;
  show(
    snapshot: SelectionSnapshot,
    config: SmartBarPageConfig,
    reason: SmartBarShowReason,
  ): void;
  hide(): void;
  // Whether the toolbar or a result shows.
  isShown(): boolean;
  // The toolbar goes with its selection; a result stays until dismissed.
  selectionChanged(): void;
  frameBlurred(): void;
};

const UI_KEY = "__obaSmartBarUi";
const TRIGGER_KEY = "__obaSmartBarTrigger";

// Globals of the extension's isolated world in this frame.
type Globals = { [UI_KEY]?: SmartBarUi; [TRIGGER_KEY]?: true };

// True for the first page script in this frame, false for later copies.
export function claimSmartBarTrigger() {
  const globals = globalThis as Globals;
  if (globals[TRIGGER_KEY]) return false;
  globals[TRIGGER_KEY] = true;
  return true;
}

export function getSmartBarUi() {
  return (globalThis as Globals)[UI_KEY];
}

export function setSmartBarUi(ui: SmartBarUi | undefined) {
  (globalThis as Globals)[UI_KEY] = ui;
}

// By identity: elements the page makes can't count as the bar.
export function isSmartBarEvent(event: Event) {
  const host = getSmartBarUi()?.host;
  return !!host && event.composedPath().includes(host);
}
