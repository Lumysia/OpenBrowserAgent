import { BROWSER_TOOL_NAME } from "../shared/browser-tools";

const CDP_VERSION = "1.3";
const DEFAULT_WAIT_MS = 5000;
const WAIT_FOR_TEXT_POLL_MS = 250;
const DEFAULT_KEY = "Enter";

const cdpNames = new Set<string>([
  BROWSER_TOOL_NAME.cdpMouseActionByAiID,
  BROWSER_TOOL_NAME.cdpClickAt,
  BROWSER_TOOL_NAME.cdpPressKey,
  BROWSER_TOOL_NAME.cdpTypeText,
  BROWSER_TOOL_NAME.cdpFill,
  BROWSER_TOOL_NAME.cdpFillForm,
  BROWSER_TOOL_NAME.cdpDrag,
  BROWSER_TOOL_NAME.cdpHandleDialog,
  BROWSER_TOOL_NAME.cdpListPages,
  BROWSER_TOOL_NAME.cdpNewPage,
  BROWSER_TOOL_NAME.cdpNavigatePage,
  BROWSER_TOOL_NAME.cdpSelectPage,
  BROWSER_TOOL_NAME.cdpClosePage,
  BROWSER_TOOL_NAME.cdpWaitFor,
  BROWSER_TOOL_NAME.cdpResizePage,
  BROWSER_TOOL_NAME.cdpEmulate,
  BROWSER_TOOL_NAME.cdpEvaluateScript,
  BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript,
  BROWSER_TOOL_NAME.cdpTakeScreenshot,
  BROWSER_TOOL_NAME.cdpTakeSnapshot,
  BROWSER_TOOL_NAME.cdpListConsoleMessages,
  BROWSER_TOOL_NAME.cdpGetConsoleMessage,
  BROWSER_TOOL_NAME.cdpListNetworkRequests,
  BROWSER_TOOL_NAME.cdpGetNetworkRequest,
  BROWSER_TOOL_NAME.cdpPerformanceStartTrace,
  BROWSER_TOOL_NAME.cdpPerformanceStopTrace,
  BROWSER_TOOL_NAME.cdpPerformanceAnalyzeInsight,
  BROWSER_TOOL_NAME.cdpTakeMemorySnapshot,
  BROWSER_TOOL_NAME.cdpGetMemorySnapshotDetails,
  BROWSER_TOOL_NAME.cdpGetNodesByClass,
  BROWSER_TOOL_NAME.cdpLoadMemorySnapshot,
  BROWSER_TOOL_NAME.cdpLighthouseAudit,
  BROWSER_TOOL_NAME.cdpScreencastStart,
  BROWSER_TOOL_NAME.cdpScreencastStop,
]);

export function isCdpTool(name: string | undefined) {
  return !!name && cdpNames.has(name);
}

export async function executeCdpTool(
  name: string | undefined,
  args: Record<string, unknown>,
) {
  switch (name) {
    case BROWSER_TOOL_NAME.cdpListPages:
      return listPages();
    case BROWSER_TOOL_NAME.cdpNewPage:
      return newPage(args);
    case BROWSER_TOOL_NAME.cdpSelectPage:
      return selectPage(args);
    case BROWSER_TOOL_NAME.cdpClosePage:
      return closePage(args);
    case BROWSER_TOOL_NAME.cdpNavigatePage:
      return navigatePage(args);
    case BROWSER_TOOL_NAME.cdpWaitFor:
      return waitFor(args);
    case BROWSER_TOOL_NAME.cdpResizePage:
      return resizePage(args);
    case BROWSER_TOOL_NAME.cdpClickAt:
      return withCdp(args, (target) => clickAt(target, args));
    case BROWSER_TOOL_NAME.cdpPressKey:
      return withCdp(args, (target) => pressKey(target, args));
    case BROWSER_TOOL_NAME.cdpTypeText:
      return withCdp(args, (target) => typeText(target, args));
    case BROWSER_TOOL_NAME.cdpFill:
      return fill(args);
    case BROWSER_TOOL_NAME.cdpFillForm:
      return fillForm(args);
    case BROWSER_TOOL_NAME.cdpDrag:
      return withCdp(args, (target) => drag(target, args));
    case BROWSER_TOOL_NAME.cdpHandleDialog:
      return handleDialog(args);
    case BROWSER_TOOL_NAME.cdpEmulate:
      return withCdp(args, (target) => emulate(target, args));
    case BROWSER_TOOL_NAME.cdpEvaluateScript:
      return withCdp(args, (target) => evaluateScript(target, args));
    case BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript:
      return executeArbitraryJavaScript(args);
    case BROWSER_TOOL_NAME.cdpTakeScreenshot:
      return withCdp(args, (target) => takeScreenshot(target, args));
    case BROWSER_TOOL_NAME.cdpTakeSnapshot:
      return takeSnapshot(args);
    case BROWSER_TOOL_NAME.cdpListConsoleMessages:
      return withCdp(args, listConsoleMessages);
    case BROWSER_TOOL_NAME.cdpGetConsoleMessage:
      return unsupported(name, "Console message history is not persisted yet.");
    case BROWSER_TOOL_NAME.cdpListNetworkRequests:
      return withCdp(args, listNetworkRequests);
    case BROWSER_TOOL_NAME.cdpGetNetworkRequest:
      return unsupported(name, "Network request bodies are not persisted yet.");
    default:
      return unsupported(
        name || "cdp",
        "This CDP MCP tool is registered but not implemented in the extension runtime yet.",
      );
  }
}

async function withCdp(
  args: Record<string, unknown>,
  run: (target: chrome.debugger.Debuggee) => Promise<unknown>,
) {
  const tabId = await resolveTabId(args.tabId);
  const target = { tabId };
  await chrome.debugger.attach(target, CDP_VERSION);
  try {
    return await run(target);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function listPages() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url }));
}

async function newPage(args: Record<string, unknown>) {
  const tab = await chrome.tabs.create({
    url: stringInput(args.url) || "about:blank",
    active: args.background !== true,
  });
  return { tab: { id: tab.id, title: tab.title, url: tab.url } };
}

async function selectPage(args: Record<string, unknown>) {
  const tab = await chrome.tabs.update(await resolveTabId(args.tabId), {
    active: args.bringToFront !== false,
  });
  if (!tab?.id) return { success: false, error: "Tab not found" };
  if (tab.windowId !== undefined)
    await chrome.windows.update(tab.windowId, { focused: true });
  return { success: true, tabId: tab.id };
}

async function closePage(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  await chrome.tabs.remove(tabId);
  return { success: true, tabId };
}

async function navigatePage(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const type = stringInput(args.type) || (args.url ? "url" : "reload");
  if (type === "back" || type === "forward")
    await withCdp({ tabId }, (target) =>
      send(target, type === "back" ? "Page.goBack" : "Page.goForward"),
    );
  else if (type === "url")
    await chrome.tabs.update(tabId, { url: stringInput(args.url) });
  else
    await chrome.tabs.reload(tabId, { bypassCache: args.ignoreCache === true });
  return { success: true, tabId, type };
}

async function waitFor(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const texts = Array.isArray(args.text)
    ? args.text.map(String)
    : [stringInput(args.text)];
  const timeout = numberInput(args.timeout) || DEFAULT_WAIT_MS;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [texts],
      func: (values) =>
        values.some((text) => text && document.body?.innerText.includes(text)),
    });
    if (result.result)
      return { success: true, tabId, text: texts.find(Boolean) };
    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TEXT_POLL_MS));
  }
  return { success: false, error: "Timed out waiting for text", tabId };
}

async function resizePage(args: Record<string, unknown>) {
  const tab = await chrome.tabs.get(await resolveTabId(args.tabId));
  if (tab.windowId === undefined)
    return { success: false, error: "Tab has no window" };
  await chrome.windows.update(tab.windowId, {
    width: numberInput(args.width),
    height: numberInput(args.height),
  });
  return { success: true, tabId: tab.id };
}

async function clickAt(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const x = numberInput(args.x) || 0;
  const y = numberInput(args.y) || 0;
  const count = args.dblClick === true ? 2 : 1;
  await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (let clickCount = 1; clickCount <= count; clickCount += 1) {
    await send(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount,
    });
    await send(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount,
    });
  }
  return { success: true, x, y };
}

async function pressKey(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const key = stringInput(args.key) || DEFAULT_KEY;
  await send(target, "Input.dispatchKeyEvent", { type: "keyDown", key });
  await send(target, "Input.dispatchKeyEvent", { type: "keyUp", key });
  return { success: true, key };
}

async function typeText(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const text = stringInput(args.text);
  await send(target, "Input.insertText", { text });
  if (args.submitKey) await pressKey(target, { key: args.submitKey });
  return { success: true, textLength: text.length };
}

async function fill(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const id = stringInput(args.id || args.uid);
  const value = stringInput(args.value);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [id, value],
    func: (aiId, nextValue) => {
      const element = document.querySelector(
        `[data-ai-id="${CSS.escape(aiId)}"]`,
      ) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
      if (!element) return { success: false, error: "Element not found" };
      element.focus?.();
      if ("value" in element)
        (element as HTMLInputElement | HTMLTextAreaElement).value = nextValue;
      else element.textContent = nextValue;
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: nextValue }),
      );
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    },
  });
  return { ...(result.result || { success: false }), tabId };
}

async function fillForm(args: Record<string, unknown>) {
  const elements = Array.isArray(args.elements) ? args.elements : [];
  const results = [];
  for (const element of elements)
    results.push(
      await fill({
        ...(element as Record<string, unknown>),
        tabId: args.tabId,
      }),
    );
  return {
    success: results.every(
      (result) => (result as { success?: boolean }).success,
    ),
    results,
  };
}

async function drag(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const from = pointInput(args.fromX, args.fromY);
  const to = pointInput(args.toX, args.toY);
  await send(target, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...from,
  });
  await send(target, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...from,
    button: "left",
    buttons: 1,
  });
  await send(target, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...to,
    buttons: 1,
  });
  await send(target, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...to,
    button: "left",
    buttons: 0,
  });
  return { success: true, from, to };
}

async function handleDialog(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      success: true,
      note: "No browser dialog is currently tracked.",
    }),
  });
  return result.result;
}

async function emulate(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  if (args.viewport) {
    const [width, height, deviceScaleFactor = 1] = stringInput(args.viewport)
      .split(/[x,]/)
      .map(Number);
    await send(target, "Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile: stringInput(args.viewport).includes("mobile"),
    });
  }
  if (args.userAgent !== undefined)
    await send(target, "Network.setUserAgentOverride", {
      userAgent: stringInput(args.userAgent),
    });
  return { success: true };
}

async function evaluateScript(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const expression = `(${stringInput(args.function || args.expression)})()`;
  const result = await send(target, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return {
    result: result.result?.value,
    exception: result.exceptionDetails?.text,
  };
}

async function executeArbitraryJavaScript(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const code = String(args.code || "");
  if (!code.trim()) return { success: false, error: "Missing code", tabId };
  const world =
    stringInput(args.world).toUpperCase() === "ISOLATED" ? "ISOLATED" : "MAIN";
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: world as chrome.scripting.ExecutionWorld,
    args: [code],
    func: async (source) => {
      try {
        const value = await (0, eval)(source);
        return { success: true, value: makeSerializable(value) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      function makeSerializable(value: unknown) {
        if (value === undefined) return { type: "undefined" };
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return String(value);
        }
      }
    },
  });
  return { ...(result.result || { success: false }), tabId, world };
}

async function takeScreenshot(
  target: chrome.debugger.Debuggee,
  args: Record<string, unknown>,
) {
  const result = await send(target, "Page.captureScreenshot", {
    format: stringInput(args.format) || "png",
    fromSurface: true,
  });
  return {
    image: `data:image/${stringInput(args.format) || "png"};base64,${result.data}`,
  };
}

async function takeSnapshot(args: Record<string, unknown>) {
  const tabId = await resolveTabId(args.tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.body?.innerText || "",
  });
  return { snapshot: result.result || "", tabId };
}

async function listConsoleMessages(target: chrome.debugger.Debuggee) {
  await send(target, "Runtime.enable");
  return {
    messages: [],
    note: "Console collection starts after this call; persistent history is not stored yet.",
  };
}

async function listNetworkRequests(target: chrome.debugger.Debuggee) {
  await send(target, "Network.enable");
  const result = await send(target, "Runtime.evaluate", {
    expression:
      "performance.getEntriesByType('resource').map((r,i)=>({id:i,url:r.name,type:r.initiatorType,duration:r.duration,transferSize:r.transferSize}))",
    returnByValue: true,
  });
  return { requests: result.result?.value || [] };
}

function unsupported(name: string, reason: string) {
  return { success: false, error: reason, tool: name };
}

function send(
  target: chrome.debugger.Debuggee,
  command: string,
  params?: Record<string, unknown>,
) {
  return chrome.debugger.sendCommand(target, command, params) as Promise<
    Record<string, any>
  >;
}

async function resolveTabId(value: unknown) {
  const tabId = Number(value);
  if (Number.isFinite(tabId) && tabId > 0) return tabId;
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) throw new Error("No active tab available");
  return activeTab.id;
}

function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberInput(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pointInput(x: unknown, y: unknown) {
  return { x: numberInput(x) || 0, y: numberInput(y) || 0 };
}
