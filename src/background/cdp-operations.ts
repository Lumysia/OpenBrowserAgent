import {
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_SCREENSHOT_QUALITY,
} from "../shared/config";
import { TOOL_ERROR } from "../shared/tool-errors";
import { cdpEvaluate, type CdpSend } from "./cdp";

export async function takeCdpScreenshot(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  const format =
    args.format === "png" || args.format === "webp"
      ? args.format
      : DEFAULT_SCREENSHOT_FORMAT;
  const quality = Number(args.quality);
  const fullPage = args.fullPage === true;
  let clip;
  if (fullPage) {
    const size = (await send("Page.getLayoutMetrics")).cssContentSize;
    if (!(size?.width > 0) || !(size?.height > 0))
      throw new Error("Page content dimensions are unavailable.");
    clip = {
      x: size.x || 0,
      y: size.y || 0,
      width: size.width,
      height: size.height,
      scale: 1,
    };
  }
  const result = await send("Page.captureScreenshot", {
    format,
    ...(format === "png"
      ? {}
      : {
          quality: Number.isFinite(quality)
            ? Math.min(100, Math.max(0, Math.trunc(quality)))
            : DEFAULT_SCREENSHOT_QUALITY,
        }),
    fromSurface: true,
    captureBeyondViewport: fullPage,
    ...(clip ? { clip } : {}),
  });
  const image = `data:image/${format};base64,${result.data}`;
  return {
    success: true,
    format,
    fullPage,
    image,
    _visionImage: { dataUrl: image, type: `image/${format}` },
    note: "Screenshot pixels will be sent to the next model call as a vision image.",
  };
}

export async function emulateCdpPage(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  let viewport;
  if (args.viewport !== undefined) {
    const match = String(args.viewport)
      .trim()
      .match(/^(\d+)[x,](\d+)(?:[x,](\d+(?:\.\d+)?))?(?:,(mobile))?$/i);
    if (!match) throw new Error("Invalid viewport. Use WxH[xDPR][,mobile].");
    viewport = {
      width: Number(match[1]),
      height: Number(match[2]),
      deviceScaleFactor: Number(match[3] || 1),
      mobile: !!match[4],
    };
  } else if (args.width !== undefined || args.height !== undefined) {
    viewport = {
      width: Number(args.width),
      height: Number(args.height),
      deviceScaleFactor: 1,
      mobile: false,
    };
  }
  if (
    viewport &&
    !(
      Number.isInteger(viewport.width) &&
      Number.isInteger(viewport.height) &&
      viewport.width > 0 &&
      viewport.height > 0 &&
      viewport.deviceScaleFactor > 0
    )
  )
    throw new Error(
      "Viewport dimensions and device scale must be positive and valid.",
    );
  const colorScheme = args.colorScheme;
  if (
    colorScheme !== undefined &&
    !["dark", "light", "auto"].includes(String(colorScheme))
  )
    throw new Error("Invalid color scheme.");
  if (!viewport && args.userAgent === undefined && colorScheme === undefined)
    throw new Error("Provide viewport, userAgent, colorScheme, or reset=true.");
  if (viewport) await send("Emulation.setDeviceMetricsOverride", viewport);
  if (args.userAgent !== undefined)
    await send("Network.setUserAgentOverride", {
      userAgent: String(args.userAgent),
    });
  if (colorScheme !== undefined)
    await send("Emulation.setEmulatedMedia", {
      features:
        colorScheme === "auto"
          ? []
          : [{ name: "prefers-color-scheme", value: colorScheme }],
    });
  return {
    success: true,
    ...(viewport ? { viewport } : {}),
    note: "Emulation remains active until reset=true, debugger detach, or tab closure.",
  };
}

export async function navigateCdpPage(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  const type = String(args.type || (args.url ? "url" : "reload"));
  if (type === "back" || type === "forward") {
    // CDP has no goBack/goForward; move through real history entries.
    const history = await send("Page.getNavigationHistory");
    const entry =
      history.entries[history.currentIndex + (type === "back" ? -1 : 1)];
    if (!entry)
      return {
        success: false,
        type,
        error: "No navigation history entry in that direction",
      };
    await send("Page.navigateToHistoryEntry", { entryId: entry.id });
  } else if (type === "url") {
    const url = String(args.url || "").trim();
    if (!url) return { success: false, type, error: TOOL_ERROR.missingUrl };
    const result = await send("Page.navigate", { url });
    if (result.errorText)
      return { success: false, type, error: String(result.errorText) };
  } else if (type === "reload") {
    await send("Page.reload", { ignoreCache: args.ignoreCache === true });
  } else {
    return { success: false, type, error: TOOL_ERROR.unknownNavigationType };
  }
  return { success: true, type };
}

export async function executeArbitraryJavaScript(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  let contextId;
  if (args.world === "ISOLATED") {
    const tree = await send("Page.getFrameTree");
    const world = await send("Page.createIsolatedWorld", {
      frameId: tree.frameTree.frame.id,
      worldName: "OpenBrowserAgent",
    });
    contextId = world.executionContextId;
    // Without a context id, Runtime.evaluate would run in the MAIN world.
    if (!Number.isInteger(contextId) || contextId <= 0)
      throw new Error("CDP did not return a valid isolated execution context.");
  }
  const result = await send("Runtime.evaluate", {
    expression: `(async () => { try { const value = await (0,eval)(${JSON.stringify(String(args.code))}); if(value === undefined) return {success:true,value:{type:'undefined'}}; try {return {success:true,value:JSON.parse(JSON.stringify(value))}} catch {return {success:true,value:String(value)}} } catch(error) {return {success:false,error:error instanceof Error ? error.message : String(error)}} })()`,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {}),
  });
  if (result.exceptionDetails)
    return { success: false, error: result.exceptionDetails.text };
  return result.result?.value || { success: false };
}

// Page-side lookup of an inspected element; returns the point to click.
const ELEMENT_CENTER = `(id) => {
  const element = document.querySelector('[data-ai-id="' + CSS.escape(id) + '"]');
  if (!element) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementNotFound)}};
  const target = element.closest('button,a,input,textarea,select,label,[role="button"],[role="link"],[role="tab"],[role="listitem"],[role="gridcell"],[tabindex]:not([tabindex^="-"]),[contenteditable="true"]') || element;
  target.scrollIntoView({block:"center",inline:"center",behavior:"instant"});
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementHasNoClickableBox)}};
  return {success:true,x:rect.left+rect.width/2,y:rect.top+rect.height/2,clickedTag:target.tagName.toLowerCase(),clickedRole:target.getAttribute("role") || undefined};
}`;

const FILL = `(id, value) => {
  const element = document.querySelector('[data-ai-id="' + CSS.escape(id) + '"]');
  if (!element) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementNotFound)}};
  element.focus?.();
  // The prototype setter keeps React's value tracker in sync with the change.
  const setter = "value" in element && Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  if (setter) setter.call(element, value); else if ("value" in element) element.value = value; else element.textContent = value;
  element.dispatchEvent(new InputEvent("input",{bubbles:true,data:value}));
  element.dispatchEvent(new Event("change",{bubbles:true}));
  return {success:true};
}`;

async function call(send: CdpSend, fn: string, values: unknown[]) {
  const result = await cdpEvaluate(
    send,
    `(${fn})(...${JSON.stringify(values.map((value) => value ?? null))})`,
  );
  return result.exception
    ? { success: false, error: result.exception }
    : result.value || { success: false };
}

function fill(send: CdpSend, args: Record<string, unknown>) {
  return call(send, FILL, [
    String(args.id || args.uid || ""),
    String(args.value ?? ""),
  ]);
}

async function mouse(send: CdpSend, type: string, point: object, extra = {}) {
  await send("Input.dispatchMouseEvent", { type, ...point, ...extra });
}

export async function runCdpInput(
  send: CdpSend,
  args: Record<string, unknown>,
) {
  const operation = String(args.operation || args.action || "click");
  if (["click", "hover", "doubleClick"].includes(operation)) {
    let point = { x: Number(args.x) || 0, y: Number(args.y) || 0 };
    if (args.id || args.uid) {
      const found = await call(send, ELEMENT_CENTER, [
        String(args.id || args.uid),
      ]);
      if (!found.success) return found;
      point = found;
    }
    const at = { x: point.x, y: point.y };
    await mouse(send, "mouseMoved", at);
    if (operation !== "hover")
      for (
        let clicks = 1;
        clicks <= (operation === "doubleClick" ? 2 : 1);
        clicks++
      ) {
        const button = { button: "left", clickCount: clicks };
        await mouse(send, "mousePressed", at, { ...button, buttons: 1 });
        await mouse(send, "mouseReleased", at, { ...button, buttons: 0 });
      }
    return { success: true, ...point, action: operation };
  }
  if (operation === "fill") return fill(send, args);
  if (operation === "fillForm") {
    const results = [];
    for (const element of Array.isArray(args.elements) ? args.elements : [])
      results.push(await fill(send, element as Record<string, unknown>));
    return { success: results.every((result) => result.success), results };
  }
  if (operation === "key") return pressKey(send, args.key);
  if (operation === "type") {
    const text = String(args.text || "");
    await send("Input.insertText", { text });
    if (args.submitKey) await pressKey(send, args.submitKey);
    return { success: true, textLength: text.length };
  }
  if (operation === "drag") {
    const from = { x: Number(args.fromX) || 0, y: Number(args.fromY) || 0 };
    const to = { x: Number(args.toX) || 0, y: Number(args.toY) || 0 };
    await mouse(send, "mouseMoved", from);
    await mouse(send, "mousePressed", from, { button: "left", buttons: 1 });
    await mouse(send, "mouseMoved", to, { buttons: 1 });
    await mouse(send, "mouseReleased", to, { button: "left", buttons: 0 });
    return { success: true, from, to };
  }
  if (operation === "dialog") {
    await send("Page.handleJavaScriptDialog", {
      accept: args.action !== "dismiss",
      promptText: String(args.promptText || ""),
    });
    return { success: true };
  }
  return { success: false, error: "UNKNOWN_CDP_INPUT_OPERATION", operation };
}

const MODIFIERS: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Ctrl: 2,
  Meta: 4,
  Shift: 8,
};
const VIRTUAL_KEYS: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Delete: 46,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  " ": 32,
};

async function pressKey(send: CdpSend, value: unknown) {
  const combination = String(value || "Enter");
  const parts = combination.split("+");
  const key = parts.pop() || "+";
  const modifiers = parts.reduce(
    (bits, part) => bits | (MODIFIERS[part] || 0),
    0,
  );
  const windowsVirtualKeyCode =
    VIRTUAL_KEYS[key] ||
    (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  // Chromium performs the default action (submit, insert character) only when
  // keyDown carries the text the key produces.
  const text =
    key === "Enter" ? "\r" : key.length === 1 && !(modifiers & 6) ? key : "";
  const event = { key, modifiers, windowsVirtualKeyCode };
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    ...event,
    ...(text ? { text } : {}),
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  return { success: true, key: combination };
}
