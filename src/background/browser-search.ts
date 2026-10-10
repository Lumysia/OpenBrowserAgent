import { getBrowserApi } from "../shared/browser-api";

export async function openDefaultSearchTab(
  query: string,
  signal?: AbortSignal,
) {
  const api = getBrowserApi();
  if (!api.search?.query)
    throw new Error("Default search is unavailable in this browser.");
  signal?.throwIfAborted();
  const tab = await api.tabs.create({ url: "about:blank", active: true });
  if (tab.id === undefined) throw new Error("Search tab was not created.");
  try {
    signal?.throwIfAborted();
    await api.search.query({ text: query, tabId: tab.id });
    signal?.throwIfAborted();
    const searchedTab = await api.tabs.get(tab.id);
    signal?.throwIfAborted();
    return searchedTab;
  } catch (error) {
    await api.tabs.remove(tab.id).catch(() => undefined);
    throw error;
  }
}
