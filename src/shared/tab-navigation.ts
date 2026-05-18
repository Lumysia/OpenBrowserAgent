import { OPTIONS_HASH } from "./config";

export async function openOrFocusOptions(hash: string = OPTIONS_HASH.general) {
  const targetUrl = chrome.runtime.getURL(`/options.html${hash}`);
  const optionsUrl = chrome.runtime.getURL("/options.html");
  return openOrFocusTab({ targetUrl, matchUrlPrefix: optionsUrl });
}

export async function openOrFocusUrl(url: string) {
  return openOrFocusTab({ targetUrl: url, matchUrl: url });
}

export async function focusTab(tabId: number) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (!tab) return;
  if (tab.windowId !== undefined)
    await chrome.windows.update(tab.windowId, { focused: true });
  return tab;
}

async function openOrFocusTab({
  targetUrl,
  matchUrl,
  matchUrlPrefix,
}: {
  targetUrl: string;
  matchUrl?: string;
  matchUrlPrefix?: string;
}) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    if (!tab.url) return false;
    if (matchUrl && tab.url === matchUrl) return true;
    return !!matchUrlPrefix && tab.url.startsWith(matchUrlPrefix);
  });
  if (existing?.id) return focusTabWithUrl(existing.id, targetUrl);
  return chrome.tabs.create({ url: targetUrl });
}

async function focusTabWithUrl(tabId: number, url: string) {
  const tab = await chrome.tabs.update(tabId, { active: true, url });
  if (!tab) return;
  if (tab.windowId !== undefined)
    await chrome.windows.update(tab.windowId, { focused: true });
  return tab;
}
