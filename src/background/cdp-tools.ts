import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { resolveBrowserTabId } from "../shared/browser";
import { delay } from "../shared/cancellation";
import { TOOL_ERROR } from "../shared/tool-errors";
import { withContentSlice, withListSlice } from "./tool-utils";
import { cdpTools } from "./cdp-tool-schema";
import { cdpEvaluate, releaseCdp, withCdp, type CdpSend } from "./cdp";
import {
  emulateCdpPage,
  executeArbitraryJavaScript,
  navigateCdpPage,
  runCdpInput,
  takeCdpScreenshot,
} from "./cdp-operations";

const cdpNames = new Set(cdpTools.map((tool) => tool.function.name));
export function isCdpTool(name: string | undefined) {
  return !!name && cdpNames.has(name);
}

export async function executeCdpTool(
  name: string | undefined,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  switch (name) {
    case BROWSER_TOOL_NAME.cdpInput:
      return withCdp(args, (send) => runCdpInput(send, args), signal);
    case BROWSER_TOOL_NAME.cdpPage:
      return runCdpPage(args, signal);
    case BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript: {
      if (!String(args.code || "").trim())
        return { success: false, error: TOOL_ERROR.missingCode };
      const output = await withCdp(
        args,
        (send) => executeArbitraryJavaScript(send, args),
        signal,
      );
      return typeof output.value === "string"
        ? { ...output, ...withContentSlice({}, output.value, args, "value") }
        : output;
    }
    case BROWSER_TOOL_NAME.cdpTakeScreenshot:
      return withCdp(args, (send) => takeCdpScreenshot(send, args), signal);
    case BROWSER_TOOL_NAME.cdpDiagnostics: {
      const operation = String(args.operation || "resources");
      if (!["resources", "network"].includes(operation))
        return {
          success: false,
          error: "UNKNOWN_CDP_DIAGNOSTICS_OPERATION",
          operation,
        };
      const result = await withCdp(
        args,
        (send) =>
          cdpEvaluate(
            send,
            "performance.getEntriesByType('resource').map((r,i)=>({id:i,url:r.name,type:r.initiatorType,duration:r.duration,transferSize:r.transferSize}))",
          ),
        signal,
      );
      return result.exception
        ? { success: false, error: result.exception }
        : withListSlice({}, result.value || [], args, "requests");
    }
    default:
      return { success: false, error: TOOL_ERROR.unknownTool, tool: name };
  }
}

async function listPages(args: Record<string, unknown>) {
  const [tabs, targets] = await Promise.all([
    chrome.tabs.query({}).catch(() => []),
    chrome.debugger.getTargets().catch(() => []),
  ]);
  const pages = targets
    .filter((target) => target.type === "page")
    .map((target) => ({
      id: target.tabId || target.id,
      targetId: target.id,
      tabId: target.tabId,
      title: target.title,
      url: target.url,
      attached: target.attached,
    }));
  for (const tab of tabs)
    if (!pages.some((page) => page.tabId === tab.id))
      pages.push({
        id: tab.id!,
        targetId: "",
        tabId: tab.id,
        title: tab.title || "",
        url: tab.url || "",
        attached: false,
      });
  return withListSlice({}, pages, args, "pages");
}

async function runCdpPage(args: Record<string, unknown>, signal?: AbortSignal) {
  const operation = String(args.operation || "list");
  const targetOnly = !!args.targetId && !args.tabId;
  if (operation === "list") return listPages(args);
  if (operation === "new") {
    const tab = await chrome.tabs.create({
      url: String(args.url || "about:blank"),
      active: args.background !== true,
    });
    return { tab: { id: tab.id, title: tab.title, url: tab.url } };
  }
  if (operation === "navigate")
    return withCdp(args, (send) => navigateCdpPage(send, args), signal);
  if (operation === "focus") {
    if (targetOnly)
      return { success: false, error: TOOL_ERROR.targetIdCannotBeFocused };
    const tabId = await resolveBrowserTabId(args.tabId);
    signal?.throwIfAborted();
    const tab = await chrome.tabs.update(tabId, {
      active: args.bringToFront !== false,
    });
    if (tab?.windowId !== undefined)
      await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true, tabId };
  }
  if (operation === "close") {
    if (targetOnly)
      return withCdp(
        args,
        async (send) => {
          await send("Page.close");
          return { success: true };
        },
        signal,
      );
    const tabId = await resolveBrowserTabId(args.tabId);
    signal?.throwIfAborted();
    await chrome.tabs.remove(tabId);
    return { success: true, tabId };
  }
  if (operation === "emulate") {
    if (args.reset === true) {
      await releaseCdp(args);
      return { success: true, reset: true };
    }
    return withCdp(args, (send) => emulateCdpPage(send, args), signal, true);
  }
  if (operation === "resize") {
    if (targetOnly)
      return withCdp(args, (send) => emulateCdpPage(send, args), signal, true);
    const tabId = await resolveBrowserTabId(args.tabId);
    try {
      const tab = await chrome.tabs.get(tabId);
      signal?.throwIfAborted();
      if (tab.windowId === undefined)
        throw new Error(TOOL_ERROR.tabHasNoWindow);
      await chrome.windows.update(tab.windowId, {
        ...(args.width !== undefined ? { width: Number(args.width) } : {}),
        ...(args.height !== undefined ? { height: Number(args.height) } : {}),
      });
      return { success: true, tabId };
    } catch {
      // Windows that cannot be resized fall back to viewport emulation.
      signal?.throwIfAborted();
      const emulate = (send: CdpSend) => emulateCdpPage(send, args);
      return withCdp({ ...args, tabId }, emulate, signal, true);
    }
  }
  if (operation === "snapshot") {
    const result = await withCdp(
      args,
      (send) => cdpEvaluate(send, "document.body?.innerText || ''"),
      signal,
    );
    return result.exception
      ? { success: false, error: result.exception }
      : withContentSlice({}, result.value || "", args, "snapshot");
  }
  if (operation === "waitFor") {
    const texts = Array.isArray(args.text)
      ? args.text.map(String)
      : [String(args.text || "")];
    const until = Date.now() + (Number(args.timeout) || 5000);
    return withCdp(
      args,
      async (send) => {
        while (Date.now() <= until) {
          const { value } = await cdpEvaluate(
            send,
            `(${JSON.stringify(texts)}).find(text => text && document.body?.innerText.includes(text))`,
          );
          if (value) return { success: true, text: value };
          await delay(Math.min(250, Math.max(0, until - Date.now())), signal);
        }
        return { success: false, error: TOOL_ERROR.timedOutWaitingForText };
      },
      signal,
    );
  }
  return { success: false, error: "UNKNOWN_CDP_PAGE_OPERATION", operation };
}
