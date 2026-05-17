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

export async function extractTabText(tabId: number): Promise<string> {
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

export async function injectElementSelector(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/element-selector.js"],
  });
}

export async function getSelectedElementFromPage(
  tabId: number,
): Promise<SelectedElement | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const element = document.querySelector(
        '[data-oba-selected="true"]',
      ) as HTMLInputElement | null;
      if (!element) return null;
      return {
        success: true,
        aiId: element.getAttribute("data-ai-id") || undefined,
        innerText: element.innerText,
        outerHTML: element.outerHTML,
        tagName: element.tagName,
        value: element.value,
      };
    },
  });
  return (result.result as SelectedElement | null) ?? null;
}
