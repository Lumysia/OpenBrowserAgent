// A short note at the top of the page when translating runs into a problem,
// in a closed shadow root out of the page's styles and scripts. Styled like
// the "Copied as Markdown" note.
import type { PageToastTheme } from "../shared/page-toast";
import { TRANSLATION_ATTRIBUTE } from "./dom-rules";

const DURATION_MS = 8_000;

let current: { host: HTMLElement; timer: number } | undefined;

export function showToast(message: string, theme: PageToastTheme) {
  hideToast();
  const host = document.createElement("div");
  host.setAttribute(TRANSLATION_ATTRIBUTE, "");
  const root = host.attachShadow({ mode: "closed" });
  const dark =
    theme.scheme === "dark" ||
    (theme.scheme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = dark ? theme.dark : theme.light;
  const note = document.createElement("div");
  note.setAttribute("role", "alert");
  note.textContent = message;
  note.style.cssText = [
    "all:initial",
    "position:fixed",
    "z-index:2147483647",
    "top:16px",
    "right:16px",
    "max-width:min(380px,calc(100vw - 32px))",
    "box-sizing:border-box",
    "padding:10px 14px",
    "border-radius:10px",
    `border:1px solid ${colors.border}`,
    `border-left:4px solid ${colors.error}`,
    `background:${colors.background}`,
    `color:${colors.foreground}`,
    "font:500 13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
    `box-shadow:0 8px 24px ${colors.shadow}`,
    "transition:opacity .2s ease",
    "pointer-events:none",
  ].join(";");
  root.append(note);
  document.documentElement.append(host);
  current = { host, timer: window.setTimeout(hideToast, DURATION_MS) };
}

export function hideToast() {
  if (!current) return;
  clearTimeout(current.timer);
  current.host.remove();
  current = undefined;
}
