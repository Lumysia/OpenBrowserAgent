import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  SMART_BAR_MESSAGE,
  type SmartBarPageConfig,
  type SmartBarPrepareRequest,
  type SmartBarShowReason,
} from "../shared/smart-bar-protocol";
import { getBrowserApi } from "../shared/browser-api";
import { getSmartBarUi, isSmartBarEvent } from "./bridge";
import { readSelection, type SelectionSnapshot } from "./selection";

// The always-loaded part of the smart bar: plain listeners, no UI. The
// background decides per selection whether the bar may show (it may have been
// turned off or hidden on this site since the page loaded) and loads the UI
// into this frame the first time. A newer copy of this script in the frame
// (injected after registration, or after an update) invalidates `ctx`, which
// removes these listeners.
export function installSmartBarTrigger(ctx: ContentScriptContext) {
  // A newer mouseup or shortcut supersedes a pending one.
  let generation = 0;

  const show = async (
    snapshot: SelectionSnapshot,
    reason: SmartBarShowReason,
  ) => {
    const current = ++generation;
    const request: SmartBarPrepareRequest = {
      type: SMART_BAR_MESSAGE.prepare,
      reason,
      uiLoaded: !!getSmartBarUi(),
    };
    if (ctx.isInvalid) return;
    const response = (await getBrowserApi()
      .runtime.sendMessage(request)
      .catch(() => undefined)) as
      { ok: boolean; value?: SmartBarPageConfig } | undefined;
    const config = response?.ok ? response.value : undefined;
    if (!config || current !== generation) return;
    getSmartBarUi()?.show(snapshot, config, reason);
  };

  ctx.addEventListener(
    document,
    "mousedown",
    (event) => {
      if (isSmartBarEvent(event)) return;
      generation++;
      getSmartBarUi()?.hide();
    },
    { capture: true },
  );

  ctx.addEventListener(
    document,
    "mouseup",
    (event) => {
      if (event.button !== 0 || isSmartBarEvent(event)) return;
      const point = { x: event.clientX, y: event.clientY };
      const current = ++generation;
      // After the click's own selection change (a click that clears it).
      ctx.requestAnimationFrame(() => {
        if (current !== generation) return;
        const snapshot = readSelection(event.target, point);
        if (snapshot) void show(snapshot, "selection");
      });
    },
    { capture: true },
  );

  ctx.addEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") getSmartBarUi()?.hide();
    },
    { capture: true },
  );

  ctx.addEventListener(document, "selectionchange", () =>
    getSmartBarUi()?.selectionChanged(),
  );

  ctx.addEventListener(window, "pagehide", () => getSmartBarUi()?.hide());

  // A click in another frame (or the parent page) never reaches this one.
  ctx.addEventListener(window, "blur", () => getSmartBarUi()?.frameBlurred());

  const onMessage = (message: { type?: string }) => {
    if (message?.type !== SMART_BAR_MESSAGE.showForSelection) return;
    // Every frame of the tab gets the command; the focused one answers.
    if (!document.hasFocus()) return;
    const snapshot = readSelection(null, undefined);
    if (snapshot) void show(snapshot, "shortcut");
  };
  const { runtime } = getBrowserApi();
  runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => runtime.onMessage.removeListener(onMessage));
}
