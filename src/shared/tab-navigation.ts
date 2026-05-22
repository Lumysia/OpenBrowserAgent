import { OPTIONS_HASH } from "./config";
import { getBrowserApi } from "./storage";

export async function openOrFocusOptions(hash: string = OPTIONS_HASH.general) {
  const api = getBrowserApi();
  const targetUrl = api.runtime.getURL(`/options.html${hash}`);
  const optionsUrl = api.runtime.getURL("/options.html");
  return openOrFocusTab({ targetUrl, matchUrlPrefix: optionsUrl });
}

export async function openOrFocusUrl(url: string) {
  return openOrFocusTab({ targetUrl: url, matchUrl: url });
}

export async function focusTab(tabId: number) {
  const api = getBrowserApi();
  const tab = await api.tabs.update(tabId, { active: true });
  if (!tab) return;
  if (tab.windowId !== undefined)
    await api.windows.update(tab.windowId, { focused: true });
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
  const api = getBrowserApi();
  const tabs = await api.tabs.query({});
  const existing = tabs.find((tab) => {
    if (!tab.url) return false;
    if (matchUrl && tab.url === matchUrl) return true;
    return !!matchUrlPrefix && tab.url.startsWith(matchUrlPrefix);
  });
  if (existing?.id) return focusTabWithUrl(existing.id, targetUrl);
  return api.tabs.create({ url: targetUrl });
}

async function focusTabWithUrl(tabId: number, url: string) {
  const api = getBrowserApi();
  const tab = await api.tabs.update(tabId, { active: true, url });
  if (!tab) return;
  if (tab.windowId !== undefined)
    await api.windows.update(tab.windowId, { focused: true });
  return tab;
}
