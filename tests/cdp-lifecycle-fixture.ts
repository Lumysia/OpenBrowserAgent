import { eventListeners, toolBrowser } from "./tool-fixtures";

export function lifecycleFixture(
  pages = [{ id: "page-1", tabId: 501 as number | undefined }],
) {
  toolBrowser();
  const states = pages.map((page) => ({
    ...page,
    attached: false,
    emulated: false,
  }));
  const attaches: chrome.debugger.Debuggee[] = [];
  const detaches: chrome.debugger.Debuggee[] = [];
  const calls: Array<{
    target: chrome.debugger.Debuggee;
    method: string;
    params?: any;
  }> = [];
  const failures = {
    discovery: false,
    detach: false,
    routes: new Set<"tab" | "target">(),
  };
  const onDetach =
    eventListeners<
      (target: chrome.debugger.Debuggee, reason?: string) => void
    >();
  const stateFor = (target: chrome.debugger.Debuggee) => {
    const page = states.find((page) =>
      target.targetId
        ? page.id === target.targetId
        : page.tabId === target.tabId,
    );
    if (!page) throw new Error("Unknown target");
    return page;
  };
  const api = {
    onDetach,
    async getTargets() {
      if (failures.discovery) throw new Error("Discovery unavailable");
      return states.map((page) => ({
        ...page,
        type: "page",
        url: "about:blank",
        title: "Fixture",
      }));
    },
    async attach(target: chrome.debugger.Debuggee) {
      attaches.push(target);
      if (failures.routes.has(target.targetId ? "target" : "tab"))
        throw new Error("Attachment route unavailable");
      const page = stateFor(target);
      if (page.attached)
        throw new Error("Another debugger is already attached");
      page.attached = true;
    },
    async detach(target: chrome.debugger.Debuggee) {
      detaches.push(target);
      if (failures.detach) throw new Error("Transient detach failure");
      const page = stateFor(target);
      if (!page.attached) throw new Error("Not attached");
      page.attached = false;
      page.emulated = false;
    },
    async sendCommand(
      target: chrome.debugger.Debuggee,
      method: string,
      params?: object,
    ): Promise<any> {
      calls.push({ target, method, params });
      const page = stateFor(target);
      if (!page.attached) throw new Error("Not attached");
      if (method === "Target.getTargetInfo")
        return { targetInfo: { targetId: page.id } };
      if (method === "Emulation.setDeviceMetricsOverride") page.emulated = true;
      if (method === "Page.getFrameTree")
        return { frameTree: { frame: { id: "frame" } } };
      return { result: { value: "fixture result" }, data: "AA==" };
    },
  };
  Object.assign(chrome, { debugger: api, windows: { getAll: async () => [] } });
  chrome.tabs.query = async () =>
    states
      .filter((page) => page.tabId !== undefined)
      .map((page) => ({ id: page.tabId }) as chrome.tabs.Tab);
  function drop(target: chrome.debugger.Debuggee) {
    const page = stateFor(target);
    page.attached = false;
    page.emulated = false;
    onDetach.emit(target, "target_closed");
  }
  return { api, states, attaches, detaches, calls, failures, drop };
}
