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
    case BROWSER_TOOL_NAME.cdpMouseActionByAiID:
      return mouseActionByAiID(args);
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
  const target = await attachCdpTarget(args);
  try {
    return await run(target);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function listPages() {
  const [tabs, targets] = await Promise.all([
    chrome.tabs.query({}).catch(() => []),
    getPageTargets().catch(() => []),
  ]);
  const targetsByTabId = new Map(
    targets
      .filter((target) => target.tabId)
      .map((target) => [target.tabId, target]),
  );
  const tabPages = tabs.map((tab) => {
    const target = tab.id ? targetsByTabId.get(tab.id) : undefined;
    return {
      id: tab.id,
      targetId: target?.id,
      tabId: tab.id,
      title: tab.title || target?.title,
      url: tab.url || target?.url,
      attached: target?.attached,
    };
  });
  const tabIds = new Set(tabPages.map((tab) => tab.tabId).filter(Boolean));
  const targetPages = targets
    .filter((target) => !target.tabId || !tabIds.has(target.tabId))
    .map((target) => ({
      id: target.id,
      targetId: target.id,
      tabId: target.tabId,
      title: target.title,
      url: target.url,
      attached: target.attached,
    }));
  return [...tabPages, ...targetPages];
}

async function newPage(args: Record<string, unknown>) {
  const tab = await chrome.tabs.create({
    url: stringInput(args.url) || "about:blank",
    active: args.background !== true,
  });
  return { tab: { id: tab.id, title: tab.title, url: tab.url } };
}

async function selectPage(args: Record<string, unknown>) {
  try {
    if (hasTargetIdOnly(args)) throw new Error("Target ID cannot be focused");
    const tab = await chrome.tabs.update(await resolveTabId(args.tabId), {
      active: args.bringToFront !== false,
    });
    if (!tab?.id) return { success: false, error: "Tab not found" };
    if (tab.windowId !== undefined)
      await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true, tabId: tab.id };
  } catch (error) {
    const target = await findPageTarget(args);
    return target
      ? {
          success: false,
          targetId: target.id,
          tabId: target.tabId,
          error:
            "Page target is available through CDP, but this browser does not allow focusing it through tabs/windows APIs.",
        }
      : { success: false, error: errorMessage(error) };
  }
}

async function closePage(args: Record<string, unknown>) {
  try {
    if (hasTargetIdOnly(args)) throw new Error("Close by target ID");
    const tabId = await resolveTabId(args.tabId);
    await chrome.tabs.remove(tabId);
    return { success: true, tabId };
  } catch {
    const result = await runtimeEvaluate(args, "window.close(); true");
    return result.exception
      ? { success: false, error: result.exception }
      : { success: true };
  }
}

async function navigatePage(args: Record<string, unknown>) {
  const type = stringInput(args.type) || (args.url ? "url" : "reload");
  if (type === "back" || type === "forward")
    await withCdp(args, (target) =>
      send(target, type === "back" ? "Page.goBack" : "Page.goForward"),
    );
  else if (type === "url")
    await withCdp(args, (target) =>
      send(target, "Page.navigate", { url: stringInput(args.url) }),
    );
  else
    await withCdp(args, (target) =>
      send(target, "Page.reload", { ignoreCache: args.ignoreCache === true }),
    );
  return { success: true, type };
}

async function waitFor(args: Record<string, unknown>) {
  const texts = Array.isArray(args.text)
    ? args.text.map(String)
    : [stringInput(args.text)];
  const timeout = numberInput(args.timeout) || DEFAULT_WAIT_MS;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await withCdp(args, (target) =>
      send(target, "Runtime.evaluate", {
        expression: `(${JSON.stringify(texts)}).some((text) => text && document.body?.innerText.includes(text))`,
        returnByValue: true,
      }),
    );
    if ((result as Record<string, any>).result?.value)
      return { success: true, text: texts.find(Boolean) };
    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_TEXT_POLL_MS));
  }
  return { success: false, error: "Timed out waiting for text" };
}

async function runtimeEvaluate<T = unknown>(
  args: Record<string, unknown>,
  expression: string,
) {
  const result = (await withCdp(args, (target) =>
    send(target, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }),
  )) as Record<string, any>;
  return {
    value: result.result?.value as T,
    exception: result.exceptionDetails?.text,
  };
}

async function runtimeCall<T = unknown>(
  args: Record<string, unknown>,
  fn: string,
  values: unknown[] = [],
) {
  return runtimeEvaluate<T>(
    args,
    `(${fn})(...${JSON.stringify(values.map((value) => value ?? null))})`,
  );
}

async function attachCdpTarget(args: Record<string, unknown>) {
  const targetId = stringInput(args.targetId);
  const tabId = Number(args.tabId);
  const candidates: chrome.debugger.Debuggee[] = [];
  if (targetId) candidates.push({ targetId });
  if (Number.isFinite(tabId) && tabId > 0) candidates.push({ tabId });
  if (!targetId) {
    const target = await findPageTarget(args).catch(() => undefined);
    if (target?.id) candidates.push({ targetId: target.id });
  }
  if (!candidates.length) {
    const activeTabId = await resolveTabId(args.tabId);
    candidates.push({ tabId: activeTabId });
    const target = await findPageTarget({ ...args, tabId: activeTabId }).catch(
      () => undefined,
    );
    if (target?.id) candidates.push({ targetId: target.id });
  }

  const seen = new Set<string>();
  const errors: string[] = [];
  for (const candidate of candidates) {
    const key = candidate.targetId || `tab:${candidate.tabId}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await chrome.debugger.attach(candidate, CDP_VERSION);
      return candidate;
    } catch (error) {
      errors.push(
        `${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    errors.length
      ? `Unable to attach CDP target. ${errors.join("; ")}`
      : "Unable to resolve CDP target",
  );
}

async function findPageTarget(args: Record<string, unknown>) {
  const tabId = Number(args.tabId);
  const targetId = stringInput(args.targetId);
  const url = stringInput(args.url);
  const title = stringInput(args.title);
  const targets = await getPageTargets();
  if (targetId) return targets.find((target) => target.id === targetId);
  if (Number.isFinite(tabId) && tabId > 0)
    return targets.find((target) => target.tabId === tabId);
  if (url)
    return targets.find(
      (target) => target.url === url || target.url.includes(url),
    );
  if (title)
    return targets.find(
      (target) => target.title === title || target.title.includes(title),
    );
  const active = await chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0])
    .catch(() => undefined);
  return active?.id
    ? targets.find((target) => target.tabId === active.id)
    : targets.find((target) => !target.attached);
}

async function getPageTargets() {
  const targets = await chrome.debugger.getTargets();
  return targets.filter(
    (target) =>
      target.type === "page" && !target.url?.startsWith("devtools://"),
  );
}

async function resizePage(args: Record<string, unknown>) {
  try {
    if (hasTargetIdOnly(args)) throw new Error("Resize by target ID");
    const tab = await chrome.tabs.get(await resolveTabId(args.tabId));
    if (tab.windowId === undefined)
      return { success: false, error: "Tab has no window" };
    await chrome.windows.update(tab.windowId, {
      width: numberInput(args.width),
      height: numberInput(args.height),
    });
    return { success: true, tabId: tab.id };
  } catch {
    return withCdp(args, (target) => emulate(target, args));
  }
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

async function mouseActionByAiID(args: Record<string, unknown>) {
  const id = stringInput(args.id || args.uid);
  const point = await runtimeCall<{
    success?: boolean;
    error?: string;
    x?: number;
    y?: number;
    clickedTag?: string;
    clickedRole?: string;
  }>(
    args,
    `(aiId) => {
      const element = document.querySelector('[data-ai-id="' + CSS.escape(aiId) + '"]');
      if (!element) return { success: false, error: "Element not found" };
      const target = element.closest('button,a,[role="button"],[role="link"],[role="tab"],[role="listitem"],[role="gridcell"],[tabindex],[contenteditable="true"]') || element;
      target.scrollIntoView({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return { success: false, error: "Element has no clickable box" };
      return {
        success: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        clickedTag: target.tagName.toLowerCase(),
        clickedRole: target.getAttribute("role") || undefined,
      };
    }`,
    [id],
  );
  if (point.exception) return { success: false, error: point.exception };
  if (!point.value?.success) return point.value || { success: false };
  const action = stringInput(args.action) || "click";
  const result = await withCdp(args, (target) => {
    if (action === "hover")
      return send(target, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.value?.x,
        y: point.value?.y,
      }).then(() => ({ success: true, x: point.value?.x, y: point.value?.y }));
    return clickAt(target, {
      ...args,
      x: point.value?.x,
      y: point.value?.y,
      dblClick: action === "doubleClick",
    });
  });
  return { ...(result as Record<string, unknown>), ...point.value, action };
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
  const id = stringInput(args.id || args.uid);
  const value = stringInput(args.value);
  const result = await runtimeCall<Record<string, unknown>>(
    args,
    `(aiId, nextValue) => {
      const element = document.querySelector('[data-ai-id="' + CSS.escape(aiId) + '"]');
      if (!element) return { success: false, error: "Element not found" };
      element.focus?.();
      if ("value" in element) element.value = nextValue;
      else element.textContent = nextValue;
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: nextValue }),
      );
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    }`,
    [id, value],
  );
  return result.exception
    ? { success: false, error: result.exception }
    : result.value || { success: false };
}

async function fillForm(args: Record<string, unknown>) {
  const elements = Array.isArray(args.elements) ? args.elements : [];
  const results = [];
  for (const element of elements)
    results.push(
      await fill({
        ...(element as Record<string, unknown>),
        tabId: args.tabId,
        targetId: args.targetId,
        url: args.url,
        title: args.title,
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
  await withCdp(args, (target) =>
    send(target, "Page.handleJavaScriptDialog", {
      accept: stringInput(args.action) !== "dismiss",
      promptText: stringInput(args.promptText),
    }),
  ).catch(() => undefined);
  return {
    success: true,
    note: "Dialog handling command sent if a dialog was present.",
  };
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
  const expression = `(${stringInput(args["function"] || args.expression)})()`;
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
  const code = String(args.code || "");
  if (!code.trim()) return { success: false, error: "Missing code" };
  const result = await runtimeCall<Record<string, unknown>>(
    args,
    `async (source) => {
      try {
        const value = await (0, eval)(source);
        if (value === undefined) return { success: true, value: { type: "undefined" } };
        try { return { success: true, value: JSON.parse(JSON.stringify(value)) }; }
        catch { return { success: true, value: String(value) }; }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }`,
    [code],
  );
  return result.exception
    ? { success: false, error: result.exception }
    : result.value || { success: false };
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
  const result = await runtimeEvaluate<string>(
    args,
    "document.body?.innerText || ''",
  );
  return result.exception
    ? { success: false, error: result.exception }
    : { snapshot: result.value || "" };
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

function hasTargetIdOnly(args: Record<string, unknown>) {
  return !!stringInput(args.targetId) && !numberInput(args.tabId);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pointInput(x: unknown, y: unknown) {
  return { x: numberInput(x) || 0, y: numberInput(y) || 0 };
}
