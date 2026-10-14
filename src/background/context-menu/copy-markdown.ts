import { isScriptableUrl } from "../../shared/browser";
import { COPY_FEEDBACK_MS } from "../../shared/config";
import { getMessages } from "../../shared/i18n";
import { getBrowserApi, storage } from "../../shared/storage";
import type { PageToastTheme } from "../../shared/page-toast";
import { pageToastTheme } from "../page-toast";
import { callPage } from "../page-agent";

// How long the toolbar badge says a page can't be copied.
const BADGE_MS = 4_000;

// "Copy as Markdown": the page's main content as Markdown, written to the
// clipboard by the page itself (the click's user activation is there, and
// no clipboard permission is needed), with a short note on the page. Pages
// the browser does not let extensions script get a badge on the toolbar
// button instead.
export async function copyPageMarkdown(tab: chrome.tabs.Tab | undefined) {
  if (tab?.id === undefined) return;
  const [language, preferences] = await Promise.all([
    storage.language.get(),
    storage.preferences.get(),
  ]);
  const t = getMessages(language).contextMenu;
  const page = isScriptableUrl(tab.url)
    ? await callPage<{ text: string }>(tab.id, "mainMarkdown").catch(
        () => undefined,
      )
    : undefined;
  if (!page) return flashBadge(tab.id, t.copyUnavailable);
  const markdown = pageDocument(page.title, page.url, page.value.text);
  const [result] = await getBrowserApi().scripting.executeScript({
    target: { tabId: tab.id },
    func: writeClipboard,
    args: [
      markdown,
      { copied: t.copied, failed: t.copyFailed },
      pageToastTheme(preferences.colorScheme, preferences.accentColor),
      COPY_FEEDBACK_MS,
    ],
  });
  if (result?.result !== true) console.warn("Copy as Markdown failed");
}

// The page's title as its heading (unless its content starts with one),
// then its address and its content.
export function pageDocument(title: string, url: string, text: string) {
  const [first, ...rest] = text.split("\n");
  const [heading, body] = /^# /.test(first)
    ? [first, rest.join("\n").trim()]
    : [title.trim() && `# ${title.trim()}`, text];
  return [heading, `<${url}>`, body].filter(Boolean).join("\n\n");
}

// A short note on the toolbar button, for pages that can't be scripted.
export async function flashBadge(tabId: number, title: string) {
  const api = getBrowserApi();
  const action = api.action ?? (api as typeof chrome).browserAction;
  if (!action) return;
  const defaultTitle =
    api.runtime.getManifest().action?.default_title || "OpenBrowserAgent";
  await action.setBadgeText({ tabId, text: "!" });
  await action.setTitle({ tabId, title });
  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    void action.setTitle({ tabId, title: defaultTitle }).catch(() => undefined);
  }, BADGE_MS);
}

// Runs in the page (serialized, so self-contained). The Clipboard API needs
// a secure, focused page; the copy command is the fallback elsewhere. The
// note lives in a closed shadow root, out of the page's styles and scripts.
async function writeClipboard(
  text: string,
  labels: { copied: string; failed: string },
  theme: PageToastTheme,
  durationMs: number,
) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = false;
  }
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  if (!copied) {
    const selection = document.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) =>
          selection.getRangeAt(index),
        )
      : [];
    const active = document.activeElement as HTMLElement | null;
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    root.append(area);
    document.documentElement.append(host);
    area.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    active?.focus?.({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
  const dark =
    theme.scheme === "dark" ||
    (theme.scheme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  const colors = dark ? theme.dark : theme.light;
  const note = document.createElement("div");
  note.setAttribute("role", "status");
  note.textContent = copied ? labels.copied : labels.failed;
  note.style.cssText = [
    "all:initial",
    "position:fixed",
    "z-index:2147483647",
    "top:16px",
    "right:16px",
    "max-width:min(360px,calc(100vw - 32px))",
    "box-sizing:border-box",
    "padding:10px 14px",
    "border-radius:10px",
    `border:1px solid ${colors.border}`,
    `border-left:4px solid ${copied ? colors.accent : colors.error}`,
    `background:${colors.background}`,
    `color:${colors.foreground}`,
    "font:500 13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
    `box-shadow:0 8px 24px ${colors.shadow}`,
    "transition:opacity .2s ease",
    "pointer-events:none",
  ].join(";");
  root.append(note);
  if (!host.isConnected) document.documentElement.append(host);
  setTimeout(
    () => {
      note.style.opacity = "0";
      setTimeout(() => host.remove(), 250);
    },
    copied ? durationMs : durationMs * 2,
  );
  return copied;
}
