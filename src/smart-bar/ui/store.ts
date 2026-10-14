import { getBrowserApi } from "../../shared/browser-api";
import {
  smartBarTextTooLong,
  type SmartBarGenerateAction,
} from "../../shared/smart-bar";
import {
  smartBarResultFormat,
  type SmartBarResultFormat,
} from "../../shared/smart-bar-dictionary";
import {
  SMART_BAR_MESSAGE,
  SMART_BAR_STREAM_PORT,
  type SmartBarAllowProviderRequest,
  type SmartBarPageConfig,
  type SmartBarRunRequest,
  type SmartBarShowReason,
  type SmartBarStreamEvent,
} from "../../shared/smart-bar-protocol";
import type { SmartBarUi } from "../bridge";
import {
  restoreSelection,
  selectionContext,
  type SelectionSnapshot,
} from "../selection";

export type SmartBarResult = {
  action: SmartBarGenerateAction;
  // How to read `text`; the background asks the model for the same.
  format: SmartBarResultFormat;
  text: string;
  // tooLong: refused before anything was sent; consent: nothing was sent,
  // the provider needs the user's permission first.
  status: "streaming" | "done" | "error" | "tooLong" | "consent";
  // The model is thinking and has not started its answer.
  thinking?: boolean;
  error?: string;
  consent?: { providerId: string; host: string };
};

export type SmartBarState = {
  // Bumped on every show, so views reset per selection.
  id: number;
  snapshot?: SelectionSnapshot;
  config?: SmartBarPageConfig;
  reason?: SmartBarShowReason;
  result?: SmartBarResult;
  // A popover in the bar (the × menu) is open. Kept here, not in the
  // popover: the page script handles Esc before the popover could see it.
  popoverOpen: boolean;
};

// State of the bar in this frame, outside React so the page script can show
// it before the first render. A run streams over its own port; closing the
// port (stop, hide, new run) aborts the request in the background. `host`
// holds the bar's shadow root.
export function createSmartBarStore(host: HTMLElement) {
  let state: SmartBarState = { id: 0, popoverOpen: false };
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
    const focusInBar = document.activeElement === host;
    const { snapshot, reason } = state;
    set({
      snapshot: undefined,
      config: undefined,
      result: undefined,
      popoverOpen: false,
    });
    if (reason === "shortcut" && focusInBar) restoreSelection(snapshot);
  };

  const run = (action: SmartBarGenerateAction) => {
    const { snapshot } = state;
    if (!snapshot) return;
    stop();
    const format = smartBarResultFormat(action, snapshot.text);
    if (smartBarTextTooLong(snapshot.text))
      return set({
        result: { action, format, text: "", status: "tooLong" },
        popoverOpen: false,
      });
    set({
      result: { action, format, text: "", status: "streaming" },
      popoverOpen: false,
    });
    const current = getBrowserApi().runtime.connect({
      name: SMART_BAR_STREAM_PORT,
    });
    port = current;
    current.onMessage.addListener((event: SmartBarStreamEvent) => {
      if (port !== current) return;
      if (event.type === "delta")
        updateResult({
          text: (state.result?.text || "") + event.text,
          thinking: false,
        });
      else if (event.type === "thinking") updateResult({ thinking: true });
      else if (event.type === "error")
        updateResult({ status: "error", error: event.error });
      else if (event.type === "consent")
        updateResult({
          status: "consent",
          consent: { providerId: event.providerId, host: event.host },
        });
      else updateResult({ status: "done" });
      if (event.type !== "delta" && event.type !== "thinking") {
        current.disconnect();
        port = undefined;
      }
    });
    current.onDisconnect.addListener(() => {
      if (port !== current) return;
      port = undefined;
      // The browser's reason is English; the card says the connection
      // was lost.
      if (state.result?.status === "streaming")
        updateResult({ status: "error", error: undefined });
    });
    const request: SmartBarRunRequest = {
      type: "run",
      action,
      text: snapshot.text,
      context: selectionContext(snapshot),
    };
    current.postMessage(request);
  };

  // The user agreed in the bar: store the permission, then run again.
  const allowProvider = async () => {
    const { result } = state;
    if (result?.status !== "consent" || !result.consent) return;
    const request: SmartBarAllowProviderRequest = {
      type: SMART_BAR_MESSAGE.allowProvider,
      ...result.consent,
    };
    const response = (await getBrowserApi()
      .runtime.sendMessage(request)
      .catch(() => undefined)) as { ok?: boolean } | undefined;
    if (state.result !== result) return;
    if (response?.ok) run(result.action);
    else updateResult({ status: "error", error: undefined });
  };

  const ui: SmartBarUi = {
    host,
    show(snapshot, config, reason) {
      stop();
      set({
        id: state.id + 1,
        snapshot,
        config,
        reason,
        result: undefined,
        popoverOpen: false,
      });
    },
    hide,
    dismiss() {
      if (state.popoverOpen) set({ popoverOpen: false });
      else hide();
    },
    isShown: () => !!state.snapshot,
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
    allowProvider,
    stop,
    hide,
    setPopoverOpen: (popoverOpen: boolean) => set({ popoverOpen }),
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SmartBarStore = ReturnType<typeof createSmartBarStore>;
