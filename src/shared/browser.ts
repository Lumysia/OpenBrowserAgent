import { getBrowserApi } from "./storage";
import { TOOL_ERROR } from "./tool-errors";
import type { AttachmentTab, SelectedElement } from "./types";

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return getActiveBrowserTab();
}

async function getCurrentWindowActiveTab(): Promise<
  chrome.tabs.Tab | undefined
> {
  const [tab] = await getBrowserApi().tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

export async function getActiveBrowserTab(): Promise<
  chrome.tabs.Tab | undefined
> {
  const api = getBrowserApi();
  const currentWindowTab = await getCurrentWindowActiveTab();
  if (currentWindowTab) return currentWindowTab;
  const [lastFocusedTab] = await api.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (lastFocusedTab) return lastFocusedTab;
  const windows = await api.windows.getAll({ windowTypes: ["normal"] });
  for (const window of windows) {
    if (window.id === undefined) continue;
    const [tab] = await api.tabs.query({
      active: true,
      windowId: window.id,
    });
    if (tab) return tab;
  }
  return undefined;
}

export async function resolveBrowserTabId(value: unknown) {
  const tabId = Number(value);
  if (Number.isFinite(tabId) && tabId > 0) return tabId;
  const activeTab = await getActiveBrowserTab();
  if (!activeTab?.id) throw new Error(TOOL_ERROR.noActiveWebTabFound);
  return activeTab.id;
}

export async function getAllTabs(): Promise<AttachmentTab[]> {
  const activeTab = await getActiveBrowserTab();
  const tabs = await getBrowserApi().tabs.query(
    activeTab?.windowId === undefined ? {} : { windowId: activeTab.windowId },
  );
  return tabs
    .filter(
      (tab): tab is chrome.tabs.Tab & { id: number } =>
        typeof tab.id === "number",
    )
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
    }));
}

export function isScriptableUrl(url?: string) {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (normalized === "about:blank" || normalized === "about:srcdoc")
    return true;
  if (
    normalized.startsWith("data:text/html") ||
    normalized.startsWith("data:application/xhtml+xml")
  )
    return true;
  try {
    return ["http:", "https:", "file:", "blob:"].includes(
      new URL(url).protocol,
    );
  } catch {
    return false;
  }
}

export async function extractTabText(tabId: number): Promise<string> {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return "";
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    func: () => {
      const title = document.title;
      const url = location.href;
      const text = document.body?.innerText || "";
      return `# ${title}\n\nURL: ${url}\n\n${text}`;
    },
  });
  return String(result.result || "");
}

export async function injectElementSelector(tabId: number, prompt: string) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return false;
  await api.tabs
    .sendMessage(tabId, { type: "cancelElementSelector" })
    .catch(() => undefined);
  await api.scripting.executeScript({
    target: { tabId },
    args: [prompt],
    func: (selectorPrompt) => {
      (
        window as Window & { __obaElementSelectorPrompt?: string }
      ).__obaElementSelectorPrompt = selectorPrompt;
    },
  });
  await api.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/element-selector.js"],
  });
  return true;
}

export async function getSelectedElementFromPage(
  tabId: number,
): Promise<SelectedElement | null> {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return null;
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    func: () => {
      const element = document.querySelector('[data-oba-selected="true"]') as
        | (HTMLInputElement & HTMLElement)
        | null;
      if (!element) return null;
      const image =
        element instanceof HTMLImageElement
          ? element
          : element.querySelector("img");
      return {
        success: true,
        aiId: element.getAttribute("data-ai-id") || undefined,
        innerText: element.innerText,
        outerHTML: element.outerHTML,
        tagName: element.tagName,
        value: "value" in element ? element.value : "",
        imageSrc: image?.currentSrc || image?.src || undefined,
        imageAlt: image?.alt || undefined,
        imageWidth: image?.naturalWidth || image?.width || undefined,
        imageHeight: image?.naturalHeight || image?.height || undefined,
      };
    },
  });
  return (result.result as SelectedElement | null) ?? null;
}
