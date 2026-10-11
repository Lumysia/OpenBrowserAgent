import { resolveBrowserTabId } from "../shared/browser";
import { abortable } from "../shared/cancellation";

export type CdpSend = (
  command: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, any>>;

type Debuggee = chrome.debugger.Debuggee;
type Retained = { target: Debuggee; onDetach: (source: Debuggee) => void };

// Emulation overrides live only while the debugger stays attached, so an
// emulated page keeps its session until reset, detach, or tab close.
const retained = new Map<string, Retained>();

// targetId, then tabId, then the active tab. `url`/`title` are destinations or
// labels, never page selectors. The key names the page for either route.
async function resolveTarget(args: Record<string, unknown>) {
  const targetId =
    typeof args.targetId === "string" ? args.targetId.trim() : "";
  const tabId = Number(args.tabId);
  const hasTab = Number.isInteger(tabId) && tabId > 0;
  if (targetId) {
    const targets = await chrome.debugger.getTargets().catch(() => []);
    const match = targets.find((target) => target.id === targetId);
    if (hasTab && match?.tabId !== undefined && match.tabId !== tabId)
      throw new Error("CDP targetId and tabId identify different pages.");
    return {
      target: { targetId },
      key:
        match?.tabId !== undefined
          ? `tab:${match.tabId}`
          : `target:${targetId}`,
    };
  }
  const tab = hasTab ? tabId : await resolveBrowserTabId(undefined);
  return { target: { tabId: tab }, key: `tab:${tab}` };
}

function sameTarget(a: Debuggee, b: Debuggee) {
  return a.targetId ? a.targetId === b.targetId : a.tabId === b.tabId;
}

async function detach(target: Debuggee) {
  await chrome.debugger.detach(target).catch(() => {});
}

function release(key: string) {
  const session = retained.get(key);
  if (!session) return;
  retained.delete(key);
  chrome.debugger.onDetach.removeListener(session.onDetach);
  return detach(session.target);
}

// Attach (or reuse a retained session), run, then detach unless `retain`.
export async function withCdp<T>(
  args: Record<string, unknown>,
  run: (send: CdpSend) => Promise<T>,
  signal?: AbortSignal,
  retain = false,
): Promise<T> {
  const { target: selected, key } = await resolveTarget(args);
  signal?.throwIfAborted();
  const target = retained.get(key)?.target ?? selected;
  if (!retained.has(key)) {
    await chrome.debugger.attach(target, "1.3");
    // A late attach after Stop must not stay behind.
    if (signal?.aborted) {
      await detach(target);
      signal.throwIfAborted();
    }
  }
  const send: CdpSend = async (command, params) => {
    signal?.throwIfAborted();
    const result = await abortable(
      chrome.debugger.sendCommand(target, command, params),
      signal,
    );
    return (result || {}) as Record<string, any>;
  };
  // A failed call leaves an existing emulation session in place.
  let keep = retained.has(key);
  try {
    const result = await run(send);
    keep ||= retain;
    return result;
  } finally {
    if (!keep || signal?.aborted) {
      if (retained.has(key)) await release(key);
      else await detach(target);
    } else if (!retained.has(key)) {
      const onDetach = (source: Debuggee) => {
        if (!sameTarget(target, source)) return;
        retained.delete(key);
        chrome.debugger.onDetach.removeListener(onDetach);
      };
      chrome.debugger.onDetach.addListener(onDetach);
      retained.set(key, { target, onDetach });
    }
  }
}

export async function releaseCdp(args: Record<string, unknown>) {
  await release((await resolveTarget(args)).key);
}

export async function cdpEvaluate(send: CdpSend, expression: string) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return {
    value: result.result?.value,
    exception: result.exceptionDetails?.text as string | undefined,
  };
}
