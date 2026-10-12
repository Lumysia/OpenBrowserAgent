import type {
  SmartBarPageConfig,
  SmartBarShowReason,
} from "../shared/smart-bar-protocol";
import type { SelectionSnapshot } from "./selection";

// The page script and the lazily loaded UI script share the extension's
// isolated world in a frame; the UI registers itself here once mounted.
export type SmartBarUi = {
  show(
    snapshot: SelectionSnapshot,
    config: SmartBarPageConfig,
    reason: SmartBarShowReason,
  ): void;
  hide(): void;
  // The toolbar goes with its selection; a result stays until dismissed.
  selectionChanged(): void;
  frameBlurred(): void;
};

export const SMART_BAR_HOST_TAG = "oba-smart-bar";

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

export function isSmartBarEvent(event: Event) {
  return event
    .composedPath()
    .some(
      (node) =>
        node instanceof Element &&
        node.tagName.toLowerCase() === SMART_BAR_HOST_TAG,
    );
}
