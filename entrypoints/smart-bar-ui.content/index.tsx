import { createRoot } from "react-dom/client";
import { defineContentScript } from "wxt/utils/define-content-script";
import {
  getSmartBarUi,
  setSmartBarUi,
  SMART_BAR_HOST_TAG,
  type SmartBarUi,
} from "../../src/smart-bar/bridge";
import type { SelectionSnapshot } from "../../src/smart-bar/selection";
import { SmartBarApp } from "../../src/smart-bar/ui/smart-bar-app";
import { createSmartBarStore } from "../../src/smart-bar/ui/store";
import smartBarCss from "../../src/smart-bar/ui/smart-bar.css?inline";
import baseCss from "../../src/ui/styles/base.css?inline";
import componentsCoreCss from "../../src/ui/styles/components-core.css?inline";
import componentsOverlaysCss from "../../src/ui/styles/components-overlays.css?inline";
import themeCss from "../../src/ui/styles/theme.css?inline";

const CSS = [
  // The page's styles stop at the host.
  ":host { all: initial !important; }",
  themeCss.replaceAll(":root", ".smart-bar-theme"),
  baseCss,
  componentsCoreCss,
  componentsOverlaysCss,
  smartBarCss,
].join("\n");

// The smart bar's UI. The background injects it into a frame the first time
// the bar shows there (see src/smart-bar/trigger.ts); never in the manifest.
// It doesn't use WXT's context or shadow-root UI: pages could invalidate the
// context with a DOM event, and the root must be closed.
export default defineContentScript({
  registration: "runtime",
  cssInjectionMode: "manual",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main() {
    if (getSmartBarUi()) return;
    const store = createSmartBarStore();
    const { host, container } = createHost();
    createRoot(container).render(<SmartBarApp store={store} />);
    setSmartBarUi({
      ...store.ui,
      show(snapshot, config, reason) {
        placeHost(host, snapshot);
        store.ui.show(snapshot, config, reason);
      },
    } satisfies SmartBarUi);
  },
});

// Closed: page scripts can't reach the bar's buttons or read its results.
function createHost() {
  const host = document.createElement(SMART_BAR_HOST_TAG);
  const shadow = host.attachShadow({ mode: "closed" });
  const html = document.createElement("html");
  const head = document.createElement("head");
  const container = document.createElement("body");
  const style = document.createElement("style");
  style.textContent = CSS;
  head.append(style);
  html.append(head, container);
  shadow.append(html);
  document.documentElement.append(host);
  return { host, container };
}

// Inside an open modal dialog the page outside it is inert and below the top
// layer, so the bar goes into the dialog. The page may also have removed it.
function placeHost(host: HTMLElement, snapshot: SelectionSnapshot) {
  const { target } = snapshot;
  const node =
    target.kind === "control"
      ? target.element
      : target.range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const dialog = element?.closest("dialog");
  const parent =
    dialog?.open && dialog.matches(":modal")
      ? dialog
      : document.documentElement;
  if (host.parentNode !== parent) parent.append(host);
}
