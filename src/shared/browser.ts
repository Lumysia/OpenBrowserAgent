import type { AttachmentTab, SelectedElement } from "./types";

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function getAllTabs(): Promise<AttachmentTab[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
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
  return !!url && /^https?:\/\//i.test(url);
}

export async function extractTabText(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return "";
  const [result] = await chrome.scripting.executeScript({
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
  const tab = await chrome.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return false;
  await chrome.tabs
    .sendMessage(tabId, { type: "cancelElementSelector" })
    .catch(() => undefined);
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [prompt],
    func: (selectorPrompt) => {
      (
        window as Window & { __obaElementSelectorPrompt?: string }
      ).__obaElementSelectorPrompt = selectorPrompt;
    },
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/element-selector.js"],
  });
  return true;
}

export async function getSelectedElementFromPage(
  tabId: number,
): Promise<SelectedElement | null> {
  const tab = await chrome.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return null;
  const [result] = await chrome.scripting.executeScript({
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
