import {
  SMART_BAR_MESSAGE,
  type SmartBarPrepareRequest,
  type SmartBarPrepareResult,
  type SmartBarSettingsChangedMessage,
  type SmartBarShowReason,
} from "../shared/smart-bar-protocol";
import { getBrowserApi } from "../shared/browser-api";
import type { RuntimeReply } from "../shared/runtime-messages";
import { claimSmartBarTrigger, getSmartBarUi, isSmartBarEvent } from "./bridge";
import {
  isEditableSnapshot,
  readSelection,
  type SelectionSnapshot,
} from "./selection";

// The always-loaded part of the smart bar: plain listeners, no UI. The
// background decides per selection whether the bar may show (it may have been
// turned off or hidden on this site since the page loaded) and loads the UI
// into this frame the first time.
//
// It runs once per frame: copies injected later (after registration changes)
// find the flag in the extension's isolated world and stop. Page scripts can't
// see or reset that flag, unlike DOM events or messages they could dispatch.
// Likewise only the user's own input counts: page scripts can dispatch events
// and set the selection, but their events are never trusted.
export function installSmartBarTrigger() {
  if (!claimSmartBarTrigger()) return;

  const listen = <K extends keyof WindowEventMap>(
    target: Document | Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    capture = true,
  ) =>
    target.addEventListener(
      type,
      (event: Event) => {
        if (event.isTrusted) handler(event as WindowEventMap[K]);
      },
      { capture },
    );

  // A newer mouseup or shortcut supersedes a pending one.
  let generation = 0;
  // Whether a mouse selection is worth asking the background about (see
  // SmartBarPrepareResult); unknown until it answers or settings change.
  let onSelection: boolean | undefined;
  // The user is working with the shown bar: pressed it, and hasn't clicked
  // or typed outside it since. A page that closes its suggestion dropdown on
  // that press often clears the field's selection too; that must not hide
  // the bar under the user's click.
  let usingBar = false;

  const show = async (
    snapshot: SelectionSnapshot,
    reason: SmartBarShowReason,
  ) => {
    const current = ++generation;
    const request: SmartBarPrepareRequest = {
      type: SMART_BAR_MESSAGE.prepare,
      reason,
      uiLoaded: !!getSmartBarUi(),
      editable: isEditableSnapshot(snapshot),
    };
    // Rejects once the extension was updated or removed.
    const response = (await Promise.resolve()
      .then(() => getBrowserApi().runtime.sendMessage(request))
      .catch(() => undefined)) as
      RuntimeReply<SmartBarPrepareResult> | undefined;
    if (!response?.ok || !response.value) return;
    onSelection = response.value.onSelection;
    const { config } = response.value;
    if (!config || current !== generation) return;
    usingBar = false;
    getSmartBarUi()?.show(snapshot, config, reason);
  };

  listen(document, "mousedown", (event) => {
    usingBar = isSmartBarEvent(event);
    if (usingBar) return;
    generation++;
    getSmartBarUi()?.hide();
  });

  listen(document, "mouseup", (event) => {
    if (event.button !== 0 || onSelection === false || isSmartBarEvent(event))
      return;
    const point = { x: event.clientX, y: event.clientY };
    const current = ++generation;
    // After the click's own selection change (a click that clears it).
    requestAnimationFrame(() => {
      if (current !== generation) return;
      const snapshot = readSelection(event.target, point);
      if (snapshot) void show(snapshot, "selection");
    });
  });

  // Esc closes a shown bar (or its open menu) and nothing else: the page's
  // dialog or form doesn't see it. With no bar, it's left to the page.
  listen(window, "keydown", (event) => {
    const ui = getSmartBarUi();
    if (event.key !== "Escape" || event.isComposing || !ui?.isShown()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ui.dismiss();
  });

  // Typing in the field is the user's own change again.
  listen(document, "keydown", (event) => {
    if (!isSmartBarEvent(event)) usingBar = false;
  });

  // Text fields fire it on themselves; it reaches the document captured.
  listen(document, "selectionchange", () => {
    if (!usingBar) getSmartBarUi()?.selectionChanged();
  });

  listen(window, "pagehide", () => getSmartBarUi()?.hide(), false);
  // Settings announcements don't reach pages in the back/forward cache: ask
  // again once one is back.
  listen(
    window,
    "pageshow",
    (event) => {
      if (event.persisted) onSelection = undefined;
    },
    false,
  );
  // Single-page apps navigate without unloading the page (Navigation API
  // where the browser has it).
  (globalThis as { navigation?: EventTarget }).navigation?.addEventListener(
    "navigatesuccess",
    (event) => {
      if (event.isTrusted) getSmartBarUi()?.hide();
    },
  );

  // A click in another frame (or the parent page) never reaches this one.
  listen(window, "blur", () => getSmartBarUi()?.frameBlurred(), false);

  getBrowserApi().runtime.onMessage.addListener(
    (message: { type?: string } & Partial<SmartBarSettingsChangedMessage>) => {
      if (message?.type === SMART_BAR_MESSAGE.settingsChanged) {
        // Allowed again somewhere: this site is checked on the next mouseup.
        onSelection = message.onSelection ? undefined : false;
        return;
      }
      if (message?.type !== SMART_BAR_MESSAGE.showForSelection) return;
      // Every frame of the tab gets the command; the focused one answers.
      if (!document.hasFocus()) return;
      const snapshot = readSelection(null, undefined);
      if (snapshot) void show(snapshot, "shortcut");
    },
  );
}
