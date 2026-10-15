import { errorMessage } from "../shared/error-message";
import { isScriptableUrl } from "../shared/browser";
import { TimeoutError, withCancellationTimeout } from "../shared/cancellation";
import { getBrowserApi } from "../shared/browser-api";
import { PAGE_SCRIPT } from "../shared/page-scripts";
import { withLock } from "../shared/locks";
import { sessionRecord } from "../shared/session-record";
import { STORAGE_KEYS } from "../shared/storage-keys";
import type { PageAgentReply } from "../page";
import type { RunTab } from "./run-tab";

// Background side of the in-page agent (entrypoints/page-agent.ts). Calls
// into one tab run in order; calls into different tabs run side by side,
// except that the part handing out refs holds one lock, so the ref floor
// (which keeps refs unique across documents and tabs) is read and raised
// without races. Every browser call is bounded: a page blocked by a native
// dialog never answers, and must not stall other tabs or the run.

// Injecting is quick on any responsive page, so it doubles as a ping.
const INJECT_TIMEOUT_MS = 5_000;
const CALL_TIMEOUT_MS = 30_000;

export class PageError extends Error {}

// Element refs count up across pages and service worker restarts, so a ref
// from an earlier answer never names another element.
const refFloor = sessionRecord<number>(STORAGE_KEYS.pageRefFloor, () => 0);
// Held while a call reads the floor and raises it from the page's answer.
const REF_FLOOR_LOCK = "page-ref-floor";
// Tabs with a browser call still pending after its timeout: they stay
// blocked until it returns (when the dialog closes).
const blockedTabs = new Set<number>();

async function raiseFloor(value: number | undefined) {
  if (!value) return;
  await refFloor
    .update((floor) => Math.max(Number(floor) || 0, value))
    .catch(() => undefined);
}

export type PageTab = { id: number; title: string; url: string };

// The tab a page tool works on: the given id, else the run's tab.
export async function pageTab(
  runTab: RunTab,
  tabId: unknown,
): Promise<PageTab> {
  const tab = await runTab.target(tabId).catch((error: unknown) => {
    throw new PageError(errorMessage(error));
  });
  if (!isScriptableUrl(tab.url))
    throw new PageError(unreadable(tab.id, tab.url));
  return { id: tab.id, title: tab.title || "", url: tab.url || "" };
}

function unreadable(tabId: number, url?: string) {
  return `Tab ${tabId} shows ${url || "a browser page"}, which extensions cannot read. Navigate it to a web page, or open one with tabs.`;
}

function blockedMessage(tabId: number) {
  return `Tab ${tabId} is not responding: a JavaScript dialog (alert, confirm or prompt) is probably open, or the page is busy. Answer a dialog with act steps [{action:"dialog", value:"accept"}] or "dismiss", or ask the user to close it.`;
}

// Chrome's errors for pages it will not script, in plain words.
function pageErrorFrom(tabId: number, error: unknown) {
  const message = errorMessage(error);
  if (/error page/i.test(message))
    return new PageError(
      `Tab ${tabId} failed to load (the browser shows an error page). Reload it or open another URL.`,
    );
  if (/cannot access|cannot be scripted|permission/i.test(message))
    return new PageError(unreadable(tabId));
  if (/no tab with id/i.test(message))
    return new PageError(`Tab ${tabId} was closed.`);
  return new PageError(message);
}

// One browser call into a tab, given up after `ms`. A call that is given up
// keeps the tab marked blocked until it settles.
async function bounded<T>(
  tabId: number,
  call: () => Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  if (blockedTabs.has(tabId)) throw new PageError(blockedMessage(tabId));
  const pending = call();
  try {
    return await withCancellationTimeout(
      () => pending,
      ms,
      blockedMessage(tabId),
      signal,
    );
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TimeoutError) {
      blockedTabs.add(tabId);
      pending.then(
        () => blockedTabs.delete(tabId),
        () => blockedTabs.delete(tabId),
      );
      throw new PageError(error.message);
    }
    throw pageErrorFrom(tabId, error);
  }
}

// Runs `task` after earlier calls into the same tab.
function inTabOrder<T>(tabId: number, task: () => Promise<T>): Promise<T> {
  return withLock(`page-tab:${tabId}`, task);
}

export function callPage<T = unknown>(
  tabId: number,
  method: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ value: T; title: string; url: string }> {
  return inTabOrder(tabId, async () => {
    signal?.throwIfAborted();
    const api = getBrowserApi();
    await bounded(
      tabId,
      () =>
        api.scripting.executeScript({
          target: { tabId },
          files: [PAGE_SCRIPT.pageAgent],
        }),
      INJECT_TIMEOUT_MS,
      signal,
    );
    const reply = await withLock(REF_FLOOR_LOCK, async () => {
      const floor = Number(await refFloor.get()) || 0;
      return bounded(
        tabId,
        async () => {
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
            args: [method, { ...args, refFloor: floor }],
          });
          const value = result?.result as PageAgentReply | undefined;
          // Raised even when the answer comes after the call was given up.
          await raiseFloor(value?.refCounter);
          return value;
        },
        CALL_TIMEOUT_MS,
        signal,
      );
    });
    if (!reply)
      throw new PageError(
        "The page did not answer; it may still be loading. Try again.",
      );
    if (!reply.ok) throw new PageError(reply.error);
    return { value: reply.value as T, title: reply.title, url: reply.url };
  });
}

// A self-contained function run in the page's own JavaScript world, in
// order with the tab's other calls.
export function callMainWorld<A extends unknown[], R>(
  tabId: number,
  func: (...args: A) => R,
  args: A,
  signal?: AbortSignal,
): Promise<R> {
  return inTabOrder(tabId, async () => {
    signal?.throwIfAborted();
    const [result] = await bounded(
      tabId,
      () =>
        getBrowserApi().scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func,
          args,
        }),
      INJECT_TIMEOUT_MS,
      signal,
    );
    return result?.result as R;
  });
}
