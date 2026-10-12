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
  selectionChanged(): void;
};

export const SMART_BAR_HOST_TAG = "oba-smart-bar";

const UI_KEY = "__obaSmartBarUi";

type Globals = { [UI_KEY]?: SmartBarUi };

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
