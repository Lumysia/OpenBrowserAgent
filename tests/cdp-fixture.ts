import { toolBrowser, eventListeners } from "./tool-fixtures";

let nextTab = 100;
export function cdpFixture() {
  toolBrowser();
  const tabId = nextTab++;
  const calls: Array<{ method: string; params?: any }> = [];
  const attached: object[] = [];
  const detached: object[] = [];
  Object.assign(chrome, {
    debugger: {
      onDetach: eventListeners(),
      getTargets: async () => [
        {
          id: `target-${tabId}`,
          type: "page",
          tabId,
          url: "https://example.test",
        },
      ],
      attach: async (target: object) => {
        attached.push(target);
      },
      detach: async (target: object) => {
        detached.push(target);
      },
      sendCommand: async (_target: object, method: string, params?: object) => {
        calls.push({ method, params });
        return {
          result: { value: true },
          cssContentSize: { x: 0, y: 0, width: 800, height: 3000 },
          data: "AA==",
        };
      },
    },
  });
  return { tabId, calls, attached, detached };
}
