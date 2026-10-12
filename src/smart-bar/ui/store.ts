import { getBrowserApi } from "../../shared/browser-api";
import type { SmartBarGenerateAction } from "../../shared/smart-bar";
import {
  SMART_BAR_STREAM_PORT,
  type SmartBarPageConfig,
  type SmartBarRunRequest,
  type SmartBarShowReason,
  type SmartBarStreamEvent,
} from "../../shared/smart-bar-protocol";
import { SMART_BAR_HOST_TAG, type SmartBarUi } from "../bridge";
import { restoreSelection, type SelectionSnapshot } from "../selection";

export type SmartBarResult = {
  action: SmartBarGenerateAction;
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
};

export type SmartBarState = {
  // Bumped on every show, so views reset per selection.
  id: number;
  snapshot?: SelectionSnapshot;
  config?: SmartBarPageConfig;
  reason?: SmartBarShowReason;
  result?: SmartBarResult;
};

// State of the bar in this frame, outside React so the page script can show
// it before the first render. A run streams over its own port; closing the
// port (stop, hide, new run) aborts the request in the background.
export function createSmartBarStore() {
  let state: SmartBarState = { id: 0 };
  let port: chrome.runtime.Port | undefined;
  const listeners = new Set<() => void>();

  const set = (next: Partial<SmartBarState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  const updateResult = (change: Partial<SmartBarResult>) => {
    if (state.result) set({ result: { ...state.result, ...change } });
  };

  const stop = () => {
    port?.disconnect();
    port = undefined;
    if (state.result?.status === "streaming") updateResult({ status: "done" });
  };

  const hide = () => {
    if (!state.snapshot) return;
    stop();
    // Keyboard users return to what they had selected.
    const focusInBar =
      document.activeElement?.tagName.toLowerCase() === SMART_BAR_HOST_TAG;
    const { snapshot, reason } = state;
    set({ snapshot: undefined, config: undefined, result: undefined });
    if (reason === "shortcut" && focusInBar) restoreSelection(snapshot);
  };

  const run = (action: SmartBarGenerateAction) => {
    const { snapshot } = state;
    if (!snapshot) return;
    stop();
    set({ result: { action, text: "", status: "streaming" } });
    const current = getBrowserApi().runtime.connect({
      name: SMART_BAR_STREAM_PORT,
    });
    port = current;
    current.onMessage.addListener((event: SmartBarStreamEvent) => {
      if (port !== current) return;
      if (event.type === "delta")
        updateResult({ text: (state.result?.text || "") + event.text });
      else if (event.type === "error")
        updateResult({ status: "error", error: event.error });
      else updateResult({ status: "done" });
      if (event.type !== "delta") {
        current.disconnect();
        port = undefined;
      }
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      port = undefined;
      if (state.result?.status === "streaming")
        updateResult({
          status: "error",
          error: getBrowserApi().runtime.lastError?.message,
        });
    });
    const request: SmartBarRunRequest = {
      type: "run",
      action,
      text: snapshot.text,
    };
    current.postMessage(request);
  };

  const ui: SmartBarUi = {
    show(snapshot, config, reason) {
      stop();
      set({ id: state.id + 1, snapshot, config, reason, result: undefined });
    },
    hide,
    selectionChanged() {
      const { snapshot, result } = state;
      if (!snapshot || result) return;
      const { target } = snapshot;
      const collapsed =
        target.kind === "control"
          ? target.element.selectionStart === target.element.selectionEnd
          : getSelection()?.isCollapsed;
      if (collapsed) hide();
    },
    frameBlurred() {
      if (!state.result) hide();
    },
  };

  return {
    ui,
    run,
    stop,
    hide,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SmartBarStore = ReturnType<typeof createSmartBarStore>;
