import { createRoot, type Root } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
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

// The smart bar's UI. The background injects it into a frame the first time
// the bar shows there (see src/smart-bar/trigger.ts); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  cssInjectionMode: "manual",
  async main(ctx) {
    const store = createSmartBarStore();
    const ui = await createShadowRootUi<Root>(ctx, {
      name: SMART_BAR_HOST_TAG,
      position: "inline",
      anchor: () => document.documentElement,
      append: "last",
      css: [
        themeCss.replaceAll(":root", ".smart-bar-theme"),
        baseCss,
        componentsCoreCss,
        componentsOverlaysCss,
        smartBarCss,
      ].join("\n"),
      onMount(container) {
        const root = createRoot(container);
        root.render(<SmartBarApp store={store} />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
    const bridge: SmartBarUi = {
      ...store.ui,
      show(snapshot, config, reason) {
        placeHost(ui.shadowHost, snapshot);
        store.ui.show(snapshot, config, reason);
      },
    };
    setSmartBarUi(bridge);
    // Single-page apps navigate without unloading the page.
    ctx.addEventListener(window, "wxt:locationchange", store.hide);
    ctx.onInvalidated(() => {
      store.hide();
      if (getSmartBarUi() === bridge) setSmartBarUi(undefined);
    });
  },
});

// Inside an open modal dialog the page outside it is inert and below the top
// layer, so the bar goes into the dialog.
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
