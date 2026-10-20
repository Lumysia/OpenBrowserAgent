import type { PageToastOptions, PageToastTheme } from "../shared/page-toast";
import { markOwnUi } from "../shared/page-ui";
import { applyTheme } from "../ui/apply-theme";
import { pageShadowCss } from "../ui/page-shadow";
import { iconSvg, PAGE_TOAST_ICONS } from "./icons";
import pageToastCss from "./page-toast.css?inline";

const CSS = pageShadowCss("page-toast-theme", [], [pageToastCss]);

// The note on screen, from any of the extension's page scripts in this
// frame: they share the isolated world, and one note replaces another.
const CURRENT_KEY = "__obaPageToastCurrent";
type Globals = { [CURRENT_KEY]?: () => void };

// Longest the leaving animation may take before the note goes anyway.
const LEAVE_MS = 400;

// A short note on the page in the extension's look, in a closed shadow root
// out of the page's styles and scripts; it leaves after `durationMs`.
// `onHost` gets its host element, to take it away sooner.
export function showPageToast(
  message: string,
  theme: PageToastTheme,
  options: PageToastOptions,
  onHost?: (host: HTMLElement) => void,
) {
  const globals = globalThis as Globals;
  globals[CURRENT_KEY]?.();

  const host = document.createElement("div");
  markOwnUi(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const root = document.createElement("div");
  root.className = "page-toast-theme";
  applyTheme(root, theme);
  const frame = document.createElement("div");
  frame.className = "page-toast-frame";
  const note = document.createElement("div");
  note.className = "page-toast page-surface";
  note.dataset.tone = options.tone;
  note.setAttribute("role", options.tone === "error" ? "alert" : "status");
  const icon = iconSvg(PAGE_TOAST_ICONS[options.tone]);
  icon.classList.add("page-toast-icon");
  const text = document.createElement("span");
  text.textContent = message;
  note.append(icon, text);
  frame.append(note);
  root.append(frame);
  shadow.append(style, root);

  const remove = () => {
    clearTimeout(timer);
    host.remove();
    if (globals[CURRENT_KEY] === remove) delete globals[CURRENT_KEY];
  };
  const leave = () => {
    note.dataset.leaving = "";
    note.addEventListener("animationend", remove, { once: true });
    timer = setTimeout(remove, LEAVE_MS);
  };
  let timer = setTimeout(leave, options.durationMs);
  globals[CURRENT_KEY] = remove;
  onHost?.(host);
  document.documentElement.append(host);
}
