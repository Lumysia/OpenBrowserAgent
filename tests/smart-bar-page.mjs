import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";

// Test helpers for the smart bar on a page. The bar lives in a closed shadow
// root, out of reach of page scripts; tests reach it through CDP (a DevTools
// DOM snapshot pierces closed roots) and press it with real CDP input, which
// the page sees as trusted user input.
const HOST = "OBA-SMART-BAR";

// Runs `fn(root, argument)` in the page with the bar's shadow root, or null
// when the page has no bar.
export async function inSmartBar(page, fn, argument) {
  const { root } = await page.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const shadow = findShadowRoot(root);
  const options = { awaitPromise: true, returnByValue: true };
  if (!shadow)
    return value(
      await page.send("Runtime.evaluate", {
        ...options,
        expression: `(${fn})(null, ${JSON.stringify(argument) ?? "undefined"})`,
      }),
    );
  const objectGroup = "smart-bar-test";
  const { object } = await page.send("DOM.resolveNode", {
    nodeId: shadow.nodeId,
    objectGroup,
  });
  try {
    return value(
      await page.send("Runtime.callFunctionOn", {
        ...options,
        functionDeclaration: `function (argument) { return (${fn})(this, argument); }`,
        objectId: object.objectId,
        arguments: [{ value: argument }],
      }),
    );
  } finally {
    await page.send("Runtime.releaseObjectGroup", { objectGroup });
  }
}

function value(result) {
  if (result.exceptionDetails) throw new Error("Smart bar evaluation failed");
  return result.result?.value;
}

function findShadowRoot(node) {
  if (node.nodeName === HOST && node.shadowRoots?.length)
    return node.shadowRoots[0];
  for (const child of [
    ...(node.children || []),
    ...(node.shadowRoots || []),
    ...(node.contentDocument ? [node.contentDocument] : []),
  ]) {
    const found = findShadowRoot(child);
    if (found) return found;
  }
  return undefined;
}

export function barState(page) {
  return inSmartBar(page, (root) => {
    if (root?.querySelector(".smart-bar-result")) return "result";
    if (root?.querySelector('[role="toolbar"]')) return "toolbar";
    return "none";
  });
}

export function barHas(page, selector, text) {
  return inSmartBar(
    page,
    (root, { selector, text }) =>
      [...(root?.querySelectorAll(selector) || [])].some(
        (item) => item.textContent.trim() === text,
      ),
    { selector, text },
  );
}

export function resultText(page) {
  return inSmartBar(
    page,
    (root) => root?.querySelector(".smart-bar-result-text")?.textContent || "",
  );
}

export async function click(page, { x, y }) {
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
}

// Clicks once the element stops moving (the page can resize, e.g. when the
// side panel opens, and the bar follows).
export async function clickInBar(page, selector, text) {
  let last;
  const point = await poll(async () => {
    const current = await inSmartBar(
      page,
      (root, { selector, text }) => {
        const element = [...(root?.querySelectorAll(selector) || [])].find(
          (item) => !text || item.textContent.trim() === text,
        );
        if (!element) return undefined;
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      },
      { selector, text },
    );
    const stable =
      current && last && current.x === last.x && current.y === last.y;
    last = current;
    if (!stable) await delay(100);
    return stable && current;
  });
  await click(page, point);
}

// `commands`: editing commands the key runs (CDP sends none by itself).
export async function pressKey(
  page,
  key,
  code,
  keyCode,
  modifiers = 0,
  commands = [],
) {
  const event = { key, code, windowsVirtualKeyCode: keyCode, modifiers };
  await page.send("Input.dispatchKeyEvent", {
    ...event,
    type: "rawKeyDown",
    commands,
  });
  await page.send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
}

// A click on an empty spot, so a shown bar hides like after a user's click.
export async function clickAway(page) {
  await page.send("Page.bringToFront");
  await click(page, { x: 600, y: 560 });
  await delay(100);
}

// A real mouse drag across the element's first line.
export async function selectText(page, selector) {
  await clickAway(page);
  const rect = await page.call((selector) => {
    const box = document.querySelector(selector).getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top };
  }, selector);
  const y = rect.top + 10;
  const mouse = (type, x, buttons) =>
    page.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons,
      clickCount: 1,
    });
  await mouse("mousePressed", rect.left + 2, 1);
  await mouse("mouseMoved", (rect.left + rect.right) / 2, 1);
  await mouse("mouseMoved", rect.right - 2, 1);
  await mouse("mouseReleased", rect.right - 2, 0);
  await delay(300);
}
