import { resolveBrowserTabId } from "../shared/browser";
import { abortable } from "../shared/cancellation";

export type CdpTarget = {
  candidates: chrome.debugger.Debuggee[];
  aliases: string[];
};

export function targetAliases(target: chrome.debugger.Debuggee) {
  return [
    ...(target.targetId ? [`target:${target.targetId}`] : []),
    ...(target.tabId !== undefined ? [`tab:${target.tabId}`] : []),
  ];
}

// Discovery enriches identity; failure must not disable an explicit route.
export async function resolveCdpTarget(
  api: typeof chrome.debugger,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CdpTarget> {
  const targets = await abortable(
    Promise.resolve()
      .then(() => api.getTargets())
      .catch(() => []),
    signal,
  );
  const targetId =
    typeof args.targetId === "string" ? args.targetId.trim() : "";
  const tabId = Number(args.tabId);
  const pages = targets.filter(
    (target) =>
      target.type === "page" && !target.url?.startsWith("devtools://"),
  );
  let primary: chrome.debugger.Debuggee;
  let match: chrome.debugger.TargetInfo | undefined;
  if (targetId) {
    primary = { targetId };
    match = targets.find((target) => target.id === targetId);
    // An unrelated caller-supplied tab is never an alternate for this target.
    if (
      match?.tabId !== undefined &&
      Number.isFinite(tabId) &&
      tabId > 0 &&
      match.tabId !== tabId
    )
      throw new Error("CDP targetId and tabId identify different pages.");
  } else if (Number.isFinite(tabId) && tabId > 0) {
    primary = { tabId };
    match = targets.find((target) => target.tabId === tabId);
  } else {
    match = pages.find(
      (target) =>
        (args.url && target.url.includes(String(args.url))) ||
        (args.title && target.title.includes(String(args.title))),
    );
    if (!match) {
      const active = await abortable(
        resolveBrowserTabId(undefined).catch(() => undefined),
        signal,
      );
      match = active
        ? pages.find((target) => target.tabId === active)
        : pages.find((target) => !target.attached);
      if (!match && active)
        return { candidates: [{ tabId: active }], aliases: [`tab:${active}`] };
    }
    if (!match) throw new Error("NO_ACTIVE_WEB_TAB_FOUND");
    primary = { targetId: match.id };
  }
  const candidates = [primary];
  if (match) {
    if (match.id && !primary.targetId) candidates.push({ targetId: match.id });
    if (match.tabId !== undefined && primary.tabId === undefined)
      candidates.push({ tabId: match.tabId });
  }
  return {
    candidates,
    aliases: [...new Set(candidates.flatMap(targetAliases))],
  };
}
