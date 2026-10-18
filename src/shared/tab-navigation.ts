import { OPTIONS_HASH } from "./config";
import { getBrowserApi } from "./browser-api";

export async function openOrFocusOptions(hash: string = OPTIONS_HASH.general) {
  const api = getBrowserApi();
  const url = api.runtime.getURL(`/options.html${hash}`);
  const optionsUrl = api.runtime.getURL("/options.html");
  return openOrFocusTab(url, (tabUrl) => tabUrl.startsWith(optionsUrl));
}

export async function openOrFocusUrl(url: string) {
  return openOrFocusTab(url, (tabUrl) => tabUrl === url);
}

export async function focusTab(tabId: number, url?: string) {
  const api = getBrowserApi();
  const tab = await api.tabs.update(tabId, {
    active: true,
    ...(url ? { url } : {}),
  });
  if (!tab) return;
  if (tab.windowId !== undefined)
    await api.windows.update(tab.windowId, { focused: true });
  return tab;
}

// A tab the UI refers to (attached to a message, cited as a source): that tab
// while it still shows `url`, else a tab at `url`, opened when none is.
export async function focusTabOrUrl(tabId?: number, url?: string) {
  if (tabId !== undefined) {
    const tab = await getBrowserApi()
      .tabs.get(tabId)
      .catch(() => undefined);
    if (tab && (!url || tab.url === url)) return focusTab(tabId);
  }
  if (url) return openOrFocusUrl(url);
}

async function openOrFocusTab(
  url: string,
  matches: (tabUrl: string) => boolean,
) {
  const api = getBrowserApi();
  const tabs = await api.tabs.query({});
  // A tab already at `url` first (setup open beside another settings tab).
  const existing =
    tabs.find((tab) => tab.url === url) ??
    tabs.find((tab) => tab.url && matches(tab.url));
  if (!existing?.id) return api.tabs.create({ url });
  // Setting the same URL again would reload the page and lose its state.
  return focusTab(existing.id, existing.url === url ? undefined : url);
}
