import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { resolveBrowserTabId } from "../shared/browser";
import { delay } from "../shared/cancellation";
import { TOOL_ERROR } from "../shared/tool-errors";
import { withContentSlice, withListSlice } from "./tool-utils";
import { navigateCdpPage } from "./cdp-navigation";
import { cdpTools } from "./cdp-tool-schema";
import { createCdpRun, cdpEvaluate, type CdpRun } from "./cdp-session";
import { takeCdpScreenshot, emulateCdpPage } from "./cdp-display";
import { runCdpInput } from "./cdp-input";

const cdpNames = new Set(cdpTools.map((tool) => tool.function.name));
export function isCdpTool(name: string | undefined) {
  return !!name && cdpNames.has(name);
}

export async function executeCdpTool(
  name: string | undefined,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const run = createCdpRun(signal);
  switch (name) {
    case BROWSER_TOOL_NAME.cdpInput:
      return runCdpInput(args, run);
    case BROWSER_TOOL_NAME.cdpPage:
      return runCdpPage(args, run, signal);
    case BROWSER_TOOL_NAME.cdpEvaluateScript: {
      if (!args.function && !args.expression)
        return {
          success: false,
          error: "Provide a function or expression to evaluate.",
        };
      const result = await cdpEvaluate(
        run,
        args,
        args.function
          ? `(${String(args.function)})()`
          : String(args.expression || "undefined"),
      );
      if (result.exception)
        return {
          success: false,
          error: result.exception,
          exception: result.exception,
        };
      return {
        ...(typeof result.value === "string"
          ? withContentSlice({}, result.value, args, "result")
          : { result: result.value }),
        exception: result.exception,
      };
    }
    case BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript:
      return executeArbitraryJavaScript(args, run);
    case BROWSER_TOOL_NAME.cdpTakeScreenshot:
      return run(args, (send) => takeCdpScreenshot(send, args));
    case BROWSER_TOOL_NAME.cdpDiagnostics: {
      const operation = String(args.operation || "resources");
      if (operation === "console")
        return {
          success: false,
          error:
            "Persistent console collection is not implemented in this extension runtime.",
        };
      if (!["resources", "network"].includes(operation))
        return {
          success: false,
          error: "UNKNOWN_CDP_DIAGNOSTICS_OPERATION",
          operation,
        };
      const result = await cdpEvaluate(
        run,
        args,
        "performance.getEntriesByType('resource').map((r,i)=>({id:i,url:r.name,type:r.initiatorType,duration:r.duration,transferSize:r.transferSize}))",
      );
      return result.exception
        ? { success: false, error: result.exception }
        : withListSlice({}, result.value || [], args, "requests");
    }
    default:
      return {
        success: false,
        error:
          "This CDP tool is registered but not implemented in the extension runtime yet.",
        tool: name,
      };
  }
}

async function runCdpPage(
  args: Record<string, unknown>,
  run: CdpRun,
  signal?: AbortSignal,
) {
  const operation = String(args.operation || "list");
  if (operation === "list") {
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
  if (operation === "new") {
    const tab = await chrome.tabs.create({
      url: String(args.url || "about:blank"),
      active: args.background !== true,
    });
    return { tab: { id: tab.id, title: tab.title, url: tab.url } };
  }
  if (operation === "navigate")
    return run(args, (send) => navigateCdpPage(args, send));
  if (operation === "focus") {
    if (args.targetId && !args.tabId)
      return { success: false, error: TOOL_ERROR.targetIdCannotBeFocused };
    const tabId = await resolveBrowserTabId(args.tabId);
    signal?.throwIfAborted();
    const tab = await chrome.tabs.update(tabId, {
      active: args.bringToFront !== false,
    });
    signal?.throwIfAborted();
    if (tab?.windowId !== undefined)
      await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true, tabId };
  }
  if (operation === "close") {
    if (args.targetId && !args.tabId)
      return run(args, async (send) => {
        await send("Page.close");
        return { success: true };
      });
    const tabId = await resolveBrowserTabId(args.tabId);
    signal?.throwIfAborted();
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      signal?.throwIfAborted();
      return run({ ...args, tabId }, async (send) => {
        await send("Page.close");
        return { success: true, tabId };
      });
    }
    return { success: true, tabId };
  }
  if (operation === "emulate") {
    if (args.reset === true) {
      await run.release(args);
      return { success: true, reset: true };
    }
    return run(args, (send) => emulateCdpPage(send, args), true);
  }
  if (operation === "resize") {
    if (args.targetId && !args.tabId)
      return run(args, (send) => emulateCdpPage(send, args), true);
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
      signal?.throwIfAborted();
      return run(
        { ...args, tabId },
        (send) => emulateCdpPage(send, args),
        true,
      );
    }
  }
  if (operation === "snapshot") {
    const result = await cdpEvaluate(
      run,
      args,
      "document.body?.innerText || ''",
    );
    return result.exception
      ? { success: false, error: result.exception }
      : withContentSlice({}, result.value || "", args, "snapshot");
  }
  if (operation === "waitFor") {
    const texts = Array.isArray(args.text)
      ? args.text.map(String)
      : [String(args.text || "")];
    const timeout = Number(args.timeout) || 5000;
    const until = Date.now() + timeout;
    return run(args, async (send) => {
      while (Date.now() <= until) {
        const result = await send("Runtime.evaluate", {
          expression: `(${JSON.stringify(texts)}).find(text => text && document.body?.innerText.includes(text))`,
          returnByValue: true,
        });
        if (result.result?.value)
          return { success: true, text: result.result.value };
        await delay(Math.min(250, Math.max(0, until - Date.now())), signal);
      }
      return { success: false, error: TOOL_ERROR.timedOutWaitingForText };
    });
  }
  return { success: false, error: "UNKNOWN_CDP_PAGE_OPERATION", operation };
}

async function executeArbitraryJavaScript(
  args: Record<string, unknown>,
  run: CdpRun,
) {
  const code = String(args.code || "");
  if (!code.trim()) return { success: false, error: TOOL_ERROR.missingCode };
  return run(args, async (send) => {
    let contextId;
    if (args.world === "ISOLATED") {
      const tree = await send("Page.getFrameTree");
      const world = await send("Page.createIsolatedWorld", {
        frameId: tree.frameTree.frame.id,
        worldName: "OpenBrowserAgent",
      });
      contextId = world.executionContextId;
      if (!Number.isInteger(contextId) || contextId <= 0)
        throw new Error(
          "CDP did not return a valid isolated execution context.",
        );
    }
    const result = await send("Runtime.evaluate", {
      expression: `(async () => { try { const value = await (0,eval)(${JSON.stringify(code)}); if(value === undefined) return {success:true,value:{type:'undefined'}}; try {return {success:true,value:JSON.parse(JSON.stringify(value))}} catch {return {success:true,value:String(value)}} } catch(error) {return {success:false,error:error instanceof Error ? error.message : String(error)}} })()`,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId ? { contextId } : {}),
    });
    if (result.exceptionDetails)
      return { success: false, error: result.exceptionDetails.text };
    const output = result.result?.value || { success: false };
    return typeof output.value === "string"
      ? { ...output, ...withContentSlice({}, output.value, args, "value") }
      : output;
  });
}
