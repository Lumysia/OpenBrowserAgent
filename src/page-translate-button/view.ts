// The button's elements, in a closed shadow root: the page's styles and
// scripts can't reach them.
import { PAGE_BUTTON_HOST_ATTRIBUTE } from "../shared/page-translate/button";
import { iconSvg } from "../page-toast/icons";
import { pageShadowCss } from "../ui/page-shadow";
import buttonCss from "./page-button.css?inline";

export const ROOT_CLASS = "page-button-theme";
const CSS = pageShadowCss(ROOT_CLASS, [], [buttonCss]);

type Icon = Parameters<typeof iconSvg>[0];

// Lucide's "languages", "loader-circle" and "x".
export const ICONS = {
  translate: [
    ["path", { d: "m5 8 6 6" }],
    ["path", { d: "m4 14 6-6 2-3" }],
    ["path", { d: "M2 5h12" }],
    ["path", { d: "M7 2h1" }],
    ["path", { d: "m22 22-5-10-5 10" }],
    ["path", { d: "M14 18h6" }],
  ],
  busy: [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]],
  close: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
} satisfies Record<string, Icon>;

export type PageButtonView = ReturnType<typeof createView>;

export function createView() {
  const host = document.createElement("div");
  host.setAttribute(PAGE_BUTTON_HOST_ATTRIBUTE, "");
  host.setAttribute("translate", "no");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  const dock = document.createElement("div");
  dock.className = "page-button-dock";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "page-button page-surface";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "page-button-close page-surface";
  close.setAttribute("aria-haspopup", "menu");
  close.setAttribute("aria-expanded", "false");
  close.append(iconSvg(ICONS.close));

  const menu = document.createElement("div");
  menu.className = "page-button-menu page-surface";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  const menuItem = () => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "page-button-menu-item";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    return item;
  };
  const hideOnSite = menuItem();
  const hideEverywhere = menuItem();
  menu.append(hideOnSite, hideEverywhere);
  close.setAttribute("aria-controls", (menu.id = "page-button-menu"));

  dock.append(button, close, menu);
  root.append(dock);
  shadow.append(style, root);
  return { host, root, dock, button, close, menu, hideOnSite, hideEverywhere };
}

export function setIcon(button: HTMLElement, icon: Icon) {
  button.replaceChildren(iconSvg(icon));
}
