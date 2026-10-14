import { getBrowserApi } from "./browser-api";

// A page script outlives its extension. After an update or a reload the
// browser keeps the old copy running in its own isolated world, cut off from
// the new extension (its runtime calls fail, nothing reaches its listeners),
// while the new extension's copy gets a fresh world in the same page.

// False once the extension that injected this script was updated, reloaded
// or removed.
export function isExtensionContextValid() {
  try {
    return !!getBrowserApi().runtime?.id;
  } catch {
    return false;
  }
}

// Announces this copy of the page script `name` to older copies on the page
// (events reach every world), and calls `onReplaced` when a newer copy
// announces itself while this one's extension is gone. Pages can fire the
// event too; a copy whose extension is still there ignores it.
export function claimPageScript(name: string, onReplaced: () => void) {
  const type = `oba-page-script:${name}`;
  document.dispatchEvent(new Event(type));
  const listener = () => {
    if (isExtensionContextValid()) return;
    document.removeEventListener(type, listener);
    onReplaced();
  };
  document.addEventListener(type, listener);
}
