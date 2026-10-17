import { eventListeners } from "./fake-chrome";
import { toolBrowser } from "./tool-fixtures";

type Page = { id: string; tabId?: number; url?: string };

// A fake chrome.debugger that tracks attachment per page, like Chrome does.
export function cdpFixture(pages: Page[] = [{ id: "page-1", tabId: 501 }]) {
  toolBrowser(
    pages.flatMap((page) =>
      page.tabId === undefined
        ? []
        : [{ id: page.tabId, ...(page.url ? { url: page.url } : {}) }],
    ),
  );
  const attached = new Set<Page>();
  const attaches: chrome.debugger.Debuggee[] = [];
  const detaches: chrome.debugger.Debuggee[] = [];
  const calls: Array<{
    target: chrome.debugger.Debuggee;
    method: string;
    params?: any;
  }> = [];
  const onDetach =
    eventListeners<
      (target: chrome.debugger.Debuggee, reason?: string) => void
    >();
  const onEvent =
    eventListeners<
      (
        target: chrome.debugger.Debuggee,
        method: string,
        params?: object,
      ) => void
    >();
  const page = (target: chrome.debugger.Debuggee) => {
    const found = pages.find((page) =>
      target.targetId
        ? page.id === target.targetId
        : page.tabId === target.tabId,
    );
    if (!found) throw new Error("Unknown target");
    return found;
  };
  const api = {
    onDetach,
    onEvent,
    getTargets: async () =>
      pages.map((page) => ({
        ...page,
        type: "page",
        url: page.url || "about:blank",
        attached: attached.has(page),
      })),
    async attach(target: chrome.debugger.Debuggee) {
      attaches.push(target);
      if (attached.has(page(target)))
        throw new Error("Another debugger is already attached");
      attached.add(page(target));
    },
    async detach(target: chrome.debugger.Debuggee) {
      detaches.push(target);
      if (!attached.delete(page(target))) throw new Error("Not attached");
    },
    async sendCommand(
      target: chrome.debugger.Debuggee,
      method: string,
      params?: any,
    ): Promise<any> {
      calls.push({ target, method, params });
      if (!attached.has(page(target))) throw new Error("Not attached");
      if (method === "Page.getFrameTree")
        return { frameTree: { frame: { id: "frame" } } };
      return {
        result: { value: true },
        cssContentSize: { x: 0, y: 0, width: 800, height: 3000 },
        data: "AA==",
      };
    },
  };
  Object.assign(chrome, { debugger: api, windows: { getAll: async () => [] } });
  chrome.tabs.query = async () => [{ id: pages[0].tabId }] as chrome.tabs.Tab[];
  // Chrome detaching the debugger (the user canceled it, the tab closed).
  const drop = (target: chrome.debugger.Debuggee, reason = "target_closed") => {
    attached.delete(page(target));
    onDetach.emit(target, reason);
  };
  // An event of an attached page, as Chrome sends it.
  const emit = (tabId: number, method: string, params: object) =>
    onEvent.emit({ tabId }, method, params);
  return { api, attached, attaches, detaches, calls, drop, emit };
}
