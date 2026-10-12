import { isScriptableUrl, resolveBrowserTabId } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import type { PageAgentReply } from "../page";

// Background side of the in-page agent (entrypoints/page-agent.ts). Calls
// are serialized so the ref floor, which keeps refs unique across documents
// and tabs, is read and raised without races.

const PAGE_AGENT_FILE = "/page-agent.js";
const REF_FLOOR_KEY = "pageRefFloor";

export class PageError extends Error {}

let floor: number | undefined;
let queue: Promise<unknown> = Promise.resolve();

async function readFloor() {
  if (floor === undefined) {
    const stored = await getBrowserApi()
      .storage.session?.get(REF_FLOOR_KEY)
      .catch(() => undefined);
    floor = Number(stored?.[REF_FLOOR_KEY]) || 0;
  }
  return floor;
}

async function raiseFloor(value: number) {
  if (!(value > (floor || 0))) return;
  floor = value;
  await getBrowserApi()
    .storage.session?.set({ [REF_FLOOR_KEY]: value })
    .catch(() => undefined);
}

export type PageTab = { id: number; title: string; url: string };

// The tab a page tool works on: the given id, else the active tab.
export async function pageTab(tabId: unknown): Promise<PageTab> {
  const api = getBrowserApi();
  const id = await resolveBrowserTabId(tabId);
  const tab = await api.tabs.get(id).catch(() => undefined);
  if (!tab)
    throw new PageError(
      `Tab ${id} does not exist. Use tabs (action list) to see open tabs.`,
    );
  if (!isScriptableUrl(tab.url))
    throw new PageError(
      `Tab ${id} shows ${tab.url || "a browser page"}, which extensions cannot read. Switch to or open a web page.`,
    );
  return { id, title: tab.title || "", url: tab.url || "" };
}

export function callPage<T = unknown>(
  tabId: number,
  method: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ value: T; title: string; url: string }> {
  const run = queue.then(async () => {
    signal?.throwIfAborted();
    const api = getBrowserApi();
    await api.scripting.executeScript({
      target: { tabId },
      files: [PAGE_AGENT_FILE],
    });
    const [result] = await api.scripting.executeScript({
      target: { tabId },
      func: (name: string, values: Record<string, unknown>) =>
        (
          globalThis as unknown as {
            __obaPageAgent: (
              name: string,
              values: Record<string, unknown>,
            ) => unknown;
          }
        ).__obaPageAgent(name, values),
      args: [method, { ...args, refFloor: await readFloor() }],
    });
    const reply = result?.result as PageAgentReply | undefined;
    if (!reply)
      throw new PageError(
        "The page did not answer; it may still be loading. Try again.",
      );
    await raiseFloor(reply.refCounter);
    if (!reply.ok) throw new PageError(reply.error);
    return { value: reply.value as T, title: reply.title, url: reply.url };
  });
  queue = run.catch(() => undefined);
  return run;
}
