import { createRoot } from "react-dom/client";
import { defineContentScript } from "wxt/utils/define-content-script";
import {
  getSmartBarUi,
  setSmartBarUi,
  type SmartBarUi,
} from "../../src/smart-bar/bridge";
import type { SelectionSnapshot } from "../../src/smart-bar/selection";
import { SmartBarApp } from "../../src/smart-bar/ui/smart-bar-app";
import { createSmartBarStore } from "../../src/smart-bar/ui/store";
import smartBarCss from "../../src/smart-bar/ui/smart-bar.css?inline";
import baseCss from "../../src/ui/styles/base.css?inline";
import componentsCss from "../../src/ui/styles/components.css?inline";
import motionCss from "../../src/ui/styles/motion.css?inline";
import overlaysCss from "../../src/ui/styles/overlays.css?inline";
import tokensCss from "../../src/ui/styles/tokens.css?inline";

const CSS = [
  // The page's styles stop at the host.
  ":host { all: initial !important; }",
  // The shadow root's own root element stands in for :root.
  ...[tokensCss, motionCss, baseCss].map((css) =>
    css.replaceAll(":root", ".smart-bar-theme"),
  ),
  componentsCss,
  overlaysCss,
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
    const { host, container } = createHost();
    const store = createSmartBarStore(host);
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
// A plain div, never a custom element: custom elements belong to the
// document, so a page defining the bar's tag would run its own code on this
// element and get the closed root through ElementInternals.
function createHost() {
  const host = document.createElement("div");
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
