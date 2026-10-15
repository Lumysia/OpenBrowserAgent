import { getBrowserApi } from "../shared/browser-api";

// Pages the agent works on may open tabs or windows (a link with a target,
// window.open), which the browser brings to the front. Unless the agent's
// tab was the one in front, the user's tab (or window) is put back in front
// of them right away. The browser names the active tab as the opener of a
// tab a background page opens, so the source comes from webNavigation where
// the browser has it. Only tabs the agent's page opened are handled: the
// user's own tab switches are never undone.

type Watch = {
  // The tabs the page opened, in order.
  stop(): Promise<number[]>;
};

export async function watchOpenedTabs(sourceTabId: number): Promise<Watch> {
  const api = getBrowserApi();
  const [tabs, focused] = await Promise.all([
    api.tabs.query({ active: true }).catch(() => [] as chrome.tabs.Tab[]),
    api.windows?.getLastFocused().catch(() => undefined),
  ]);
  // The tab in front of each window, and the one before it.
  const active = new Map<number, number>();
  const before = new Map<number, number>();
  for (const tab of tabs)
    if (tab.id !== undefined) active.set(tab.windowId, tab.id);
  let userWindow = focused?.id;
  const opened: number[] = [];
  const restoring: Promise<void>[] = [];

  const onActivated = ({
    tabId,
    windowId,
  }: {
    tabId: number;
    windowId: number;
  }) => {
    const current = active.get(windowId);
    if (current !== undefined && current !== tabId)
      before.set(windowId, current);
    active.set(windowId, tabId);
    // A tab the page opened may come to the front only after it was found.
    if (opened.includes(tabId)) restoring.push(putBack(tabId));
  };
  const onFocusChanged = (windowId: number) => {
    if (windowId >= 0 && active.has(windowId)) userWindow = windowId;
  };
  const putBack = async (tabId: number) => {
    const tab = await api.tabs.get(tabId).catch(() => undefined);
    if (!tab?.active) return;
    const known = active.get(tab.windowId);
    const previous = known === tabId ? before.get(tab.windowId) : known;
    if (previous !== undefined) {
      // The user had the agent's tab in front: the page behaves as usual.
      if (previous === sourceTabId) return;
      await api.tabs.update(previous, { active: true }).catch(() => undefined);
    } else if (userWindow !== undefined && userWindow !== tab.windowId)
      // A new window: the user's window goes back in front.
      await api.windows
        .update(userWindow, { focused: true })
        .catch(() => undefined);
  };
  const found = (tabId: number) => {
    if (opened.includes(tabId)) return;
    opened.push(tabId);
    restoring.push(putBack(tabId));
  };
  const onTarget = (details: { sourceTabId: number; tabId: number }) => {
    if (details.sourceTabId === sourceTabId) found(details.tabId);
  };
  const onCreated = (tab: chrome.tabs.Tab) => {
    if (tab.openerTabId === sourceTabId && tab.id !== undefined) found(tab.id);
  };
  const targets = api.webNavigation?.onCreatedNavigationTarget;
  api.tabs.onActivated.addListener(onActivated);
  api.windows?.onFocusChanged.addListener(onFocusChanged);
  if (targets) targets.addListener(onTarget);
  else api.tabs.onCreated.addListener(onCreated);
  return {
    async stop() {
      api.tabs.onActivated.removeListener(onActivated);
      api.windows?.onFocusChanged.removeListener(onFocusChanged);
      if (targets) targets.removeListener(onTarget);
      else api.tabs.onCreated.removeListener(onCreated);
      // A tab may take the front only after it was found.
      await Promise.all(restoring);
      await Promise.all(opened.map(putBack));
      return opened;
    },
  };
}
