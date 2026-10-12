import { getBrowserApi, storage } from "./storage";
import type { AttachmentTab } from "./types";

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const api = getBrowserApi();
  for (const query of [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
  ]) {
    const [tab] = await api.tabs.query(query);
    if (tab) return tab;
  }
  const windows = await api.windows.getAll({ windowTypes: ["normal"] });
  for (const window of windows) {
    if (window.id === undefined) continue;
    const [tab] = await api.tabs.query({ active: true, windowId: window.id });
    if (tab) return tab;
  }
  return undefined;
}

export async function resolveBrowserTabId(value: unknown) {
  const tabId = Number(value);
  if (Number.isFinite(tabId) && tabId > 0) return tabId;
  const activeTab = await getActiveTab();
  if (!activeTab?.id)
    throw new Error(
      "No active tab was found. Use tabs (action list) and pass a tabId.",
    );
  return activeTab.id;
}

export async function getAllTabs(): Promise<AttachmentTab[]> {
  const activeTab = await getActiveTab();
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

export async function injectElementSelector(tabId: number, prompt: string) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(tabId);
  if (!isScriptableUrl(tab.url)) return false;
  await api.tabs
    .sendMessage(tabId, { type: "cancelElementSelector" })
    .catch(() => undefined);
  const { colorScheme, accentColor } = await storage.preferences.get();
  await api.scripting.executeScript({
    target: { tabId },
    args: [prompt, { colorScheme, accentColor }],
    func: (selectorPrompt, preferences) => {
      Object.assign(window, {
        __obaElementSelectorPrompt: selectorPrompt,
        __obaElementSelectorPreferences: preferences,
      });
    },
  });
  await api.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/element-selector.js"],
  });
  return true;
}
