import { storage } from "./storage";
import { getBrowserApi } from "./browser-api";
import { PAGE_SCRIPT } from "./page-scripts";
import { normalizeColorScheme } from "./theme/themes";
import { themeTokens } from "./theme/tokens";
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
  const accent = {
    light: themeTokens(accentColor, "light")["accent-solid"],
    dark: themeTokens(accentColor, "dark")["accent-strong"],
  };
  await api.scripting.executeScript({
    target: { tabId },
    args: [prompt, { colorScheme: normalizeColorScheme(colorScheme), accent }],
    func: (selectorPrompt, preferences) => {
      Object.assign(window, {
        __obaElementSelectorPrompt: selectorPrompt,
        __obaElementSelectorPreferences: preferences,
      });
    },
  });
  await api.scripting.executeScript({
    target: { tabId },
    files: [PAGE_SCRIPT.elementSelector],
  });
  return true;
}
