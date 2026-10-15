// The page translation button on an edge of the page: translates the page
// or shows the original, like the menu item. Registered on every page while
// it is on (see background/page-translate/button.ts), top frame only, so it
// is kept small: the page translation script is injected only when pressed.
// It follows the page's state through the isolated world it shares with
// that script, whatever started the translation. Only the user's own
// pointer and keys count: page events are never trusted.
import { getBrowserApi } from "../shared/browser-api";
import {
  claimPageScript,
  isExtensionContextValid,
} from "../shared/extension-context";
import {
  PAGE_BUTTON_MESSAGE,
  pageTranslateShared,
  type PageButtonConfig,
  type PageButtonPosition,
  type PageButtonPositionMessage,
} from "../shared/page-translate/button";
import type { RuntimeReply } from "../shared/runtime-messages";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { applyTheme, DARK_QUERY } from "../ui/apply-theme";
import { attachDrag, type DragPoint } from "./drag";
import { edgePoint, type Size } from "./geometry";
import { createView, ICONS, setIcon, type PageButtonView } from "./view";

const INSTALLED = Symbol.for("oba.pageTranslateButton");
// Its middle stays this far from the viewport's corners: the whole button
// and its close control are always inside.
const CORNER_MARGIN_PX = 28;
// What the button changes in storage, and what it shows from it.
const WATCHED_KEYS = [
  STORAGE_KEYS.preferences,
  STORAGE_KEYS.language,
  STORAGE_KEYS.pageTranslateButtonPosition,
];

// The area fixed elements are placed in: the viewport without scroll bars.
function viewportSize(): Size {
  const root = document.documentElement;
  return {
    width: Math.min(innerWidth, root.clientWidth || innerWidth),
    height: Math.min(innerHeight, root.clientHeight || innerHeight),
  };
}

export function installPageButton() {
  if (window.top !== window) return;
  const scope = globalThis as { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

  const shared = pageTranslateShared();
  let view: PageButtonView | undefined;
  let config: PageButtonConfig | undefined;
  // Where the user put it here, ahead of the stored copy.
  let position: PageButtonPosition | undefined;
  // Where a drag has it now.
  let dragPoint: DragPoint | undefined;
  let requesting = false;
  let icon: keyof typeof ICONS | undefined;
  // A newer copy of this script took over (the extension was updated).
  let replaced = false;

  function send(message: { type: string }) {
    if (!isExtensionContextValid()) return Promise.resolve(undefined);
    return getBrowserApi()
      .runtime.sendMessage(message)
      .catch(() => undefined);
  }

  function configure() {
    void send({ type: PAGE_BUTTON_MESSAGE.config }).then((reply) => {
      const answer = reply as RuntimeReply<PageButtonConfig> | undefined;
      config = answer?.ok ? answer.value : undefined;
      position = config?.position;
      if (config && view) applyTheme(view.root, config.theme);
      render();
    });
  }

  function place(next: PageButtonPosition) {
    position = next;
    render();
    const message: PageButtonPositionMessage = {
      type: PAGE_BUTTON_MESSAGE.position,
      position: next,
    };
    void send(message);
  }

  function create() {
    const created = createView();
    const { dock, button, close, menu, hideOnSite, hideEverywhere } = created;
    // The page doesn't see presses meant for the button.
    for (const type of ["pointerdown", "mousedown", "click", "dblclick"])
      dock.addEventListener(type, (event) => event.stopPropagation());
    attachDrag(button, {
      margin: () => button.offsetWidth / 2,
      viewport: viewportSize,
      current: () => position,
      move: (point) => {
        dragPoint = point;
        render();
      },
      drop: (next) => {
        dragPoint = undefined;
        place(next);
      },
      click: toggle,
    });
    close.addEventListener("click", (event) => {
      if (event.isTrusted) setMenu(menu.hidden === true);
    });
    menu.addEventListener("keydown", (event) => {
      if (!event.isTrusted) return;
      const items = [hideOnSite, hideEverywhere];
      const index = items.indexOf(event.target as HTMLButtonElement);
      if (event.key === "Escape") {
        setMenu(false);
        close.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : items.length - 1;
        items[(index + step) % items.length].focus();
      } else return;
      event.preventDefault();
      event.stopPropagation();
    });
    for (const item of [hideOnSite, hideEverywhere])
      item.addEventListener("pointermove", () => item.focus());
    const hide = (type: string) => (event: MouseEvent) => {
      if (!event.isTrusted) return;
      void send({ type });
      // Gone at once; the stored change confirms it.
      config = undefined;
      render();
    };
    hideOnSite.addEventListener("click", hide(PAGE_BUTTON_MESSAGE.hideOnSite));
    hideEverywhere.addEventListener(
      "click",
      hide(PAGE_BUTTON_MESSAGE.hideEverywhere),
    );
    if (config) applyTheme(created.root, config.theme);
    return created;
  }

  function setMenu(open: boolean) {
    if (!view) return;
    view.menu.hidden = !open;
    view.close.setAttribute("aria-expanded", String(open));
    view.dock.toggleAttribute("data-open", open);
    if (open) view.hideOnSite.focus();
  }

  function toggle() {
    if (requesting || shared.starting) return;
    if (!isExtensionContextValid()) {
      remove();
      return;
    }
    requesting = true;
    render();
    void send({ type: PAGE_BUTTON_MESSAGE.toggle }).finally(() => {
      requesting = false;
      render();
    });
  }

  function remove() {
    if (view) setMenu(false);
    view?.host.remove();
    view = undefined;
    icon = undefined;
  }

  function render() {
    if (!config?.enabled || replaced) {
      remove();
      return;
    }
    view ??= create();
    const { host, root, dock, button, close, hideOnSite, hideEverywhere } =
      view;
    if (!host.isConnected) document.documentElement.append(host);
    root.hidden = !!document.fullscreenElement;
    const at = position ?? config.position;
    const point = dragPoint ?? edgePoint(at, viewportSize(), CORNER_MARGIN_PX);
    dock.style.left = `${point.x}px`;
    dock.style.top = `${point.y}px`;
    dock.dataset.edge = at.edge;
    dock.dataset.align = at.along < 0.5 ? "start" : "end";
    dock.toggleAttribute("data-dragging", !!dragPoint);
    const { labels } = config;
    const busy = requesting || shared.starting;
    const label = busy
      ? labels.translating
      : shared.translated
        ? labels.showOriginal
        : labels.translate;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-description", labels.move);
    button.title = label;
    button.setAttribute("aria-busy", String(busy));
    button.toggleAttribute("data-translated", shared.translated);
    const next = busy ? "busy" : "translate";
    if (icon !== next) setIcon(button, ICONS[(icon = next)]);
    close.setAttribute("aria-label", labels.hide);
    close.title = labels.hide;
    hideOnSite.textContent = labels.hideOnSite;
    hideOnSite.title = labels.hideOnSite;
    hideEverywhere.textContent = labels.hideEverywhere;
    hideEverywhere.title = labels.hideEverywhere;
  }

  claimPageScript("page-translate-button", () => {
    replaced = true;
    remove();
  });
  shared.listeners.add(render);
  document.addEventListener("fullscreenchange", render);
  addEventListener("resize", render);
  // A press anywhere else closes the menu.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (view && !event.composedPath().includes(view.host)) setMenu(false);
    },
    { capture: true },
  );
  matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (config && view) applyTheme(view.root, config.theme);
  });
  getBrowserApi().storage.onChanged.addListener((changes) => {
    if (WATCHED_KEYS.some((key) => changes[key])) configure();
  });
  configure();
}
