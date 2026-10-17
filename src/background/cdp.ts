import { abortable } from "../shared/cancellation";

export type CdpSend = (
  command: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, any>>;

type Debuggee = chrome.debugger.Debuggee;
// What keeps a session attached between calls: "emulation" (its
// overrides live only while the debugger stays attached) or "capture"
// (recording network and console events).
export type CdpHold = "emulation" | "capture";
type Retained = {
  target: Debuggee;
  onDetach: (source: Debuggee) => void;
  holds: Set<CdpHold>;
};

// Held sessions stay attached until every hold is released, the debugger
// is detached (the user cancels it, the tab closes) or a call is stopped.
const retained = new Map<string, Retained>();

const tabKey = (tabId: number) => `tab:${tabId}`;

// targetId, then tabId; callers name the page, there is no default (the
// active tab may be the user's). `url`/`title` are destinations or
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
        match?.tabId !== undefined ? tabKey(match.tabId) : `target:${targetId}`,
    };
  }
  if (!hasTab) throw new Error("A tabId or targetId is required.");
  return { target: { tabId }, key: tabKey(tabId) };
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

function retain(key: string, target: Debuggee, hold: CdpHold) {
  const onDetach = (source: Debuggee) => {
    if (!sameTarget(target, source)) return;
    retained.delete(key);
    chrome.debugger.onDetach.removeListener(onDetach);
  };
  chrome.debugger.onDetach.addListener(onDetach);
  retained.set(key, { target, onDetach, holds: new Set([hold]) });
}

// Attach (or reuse a held session), run, then detach unless the session
// is held. A successful call with `hold` adds that hold.
export async function withCdp<T>(
  args: Record<string, unknown>,
  run: (send: CdpSend) => Promise<T>,
  signal?: AbortSignal,
  hold?: CdpHold,
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
  let succeeded = false;
  try {
    const result = await run(send);
    succeeded = true;
    return result;
  } finally {
    // A failed call leaves a held session in place.
    const session = retained.get(key);
    if (signal?.aborted) {
      if (session) await release(key);
      else await detach(target);
    } else if (session) {
      if (succeeded && hold) session.holds.add(hold);
    } else if (succeeded && hold) retain(key, target, hold);
    else await detach(target);
  }
}

// Releases one hold on a tab's session; the session detaches when no hold
// is left. `undo` runs on it first, to clear what the hold set rather than
// rely on the detach alone. Returns whether the hold was there.
export async function releaseCdp(
  args: Record<string, unknown>,
  hold: CdpHold,
  undo?: (send: CdpSend) => Promise<unknown>,
) {
  const { key } = await resolveTarget(args);
  const session = retained.get(key);
  if (!session?.holds.has(hold)) return false;
  if (undo)
    await undo(
      async (command, params) =>
        ((await chrome.debugger.sendCommand(session.target, command, params)) ||
          {}) as Record<string, any>,
    ).catch(() => {});
  session.holds.delete(hold);
  if (!session.holds.size) await release(key);
  return true;
}

// Whether a tab's session is attached and held for `hold`.
export const isCdpHeld = (tabId: number, hold: CdpHold) =>
  !!retained.get(tabKey(tabId))?.holds.has(hold);

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
