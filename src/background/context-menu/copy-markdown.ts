import { isScriptableUrl } from "../../shared/browser";
import { COPY_FEEDBACK_MS } from "../../shared/config";
import { getMessages } from "../../shared/i18n";
import { getBrowserApi, storage } from "../../shared/storage";
import { pageToastTheme } from "../page-toast";
import { callPage } from "../page-agent";
import { flashBadge, showPageNote } from "../page-feedback";

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
    args: [markdown],
  });
  const copied = result?.result === true;
  if (!copied) console.warn("Copy as Markdown failed");
  await showPageNote(
    tab.id,
    copied ? t.copied : t.copyFailed,
    pageToastTheme(preferences.colorScheme, preferences.accentColor),
    copied
      ? { tone: "info", durationMs: COPY_FEEDBACK_MS }
      : { tone: "error", durationMs: COPY_FEEDBACK_MS * 2 },
  );
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

// Runs in the page (serialized, so self-contained). The Clipboard API needs
// a secure, focused page; the copy command is the fallback elsewhere, from a
// field in a closed shadow root out of the page's styles and scripts.
async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The copy command below.
  }
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
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
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  host.remove();
  active?.focus?.({ preventScroll: true });
  if (selection) {
    selection.removeAllRanges();
    ranges.forEach((range) => selection.addRange(range));
  }
  return copied;
}
