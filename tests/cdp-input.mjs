import { poll } from "./chromium.mjs";

// Real input through CDP, which the page sees as trusted user input. Shared
// by the browser tests and the store screenshot scripts.
//
// Points are in CSS pixels of the page. Under browser zoom CDP's input
// coordinates differ from those; pass `scale` from `pointerScale(page)` there.

// How CDP input coordinates map to the page's CSS pixels, measured with one
// probe move (browser zoom changes it).
export async function pointerScale(page) {
  await page.call(() => {
    window.__obaPointerProbe = null;
    addEventListener(
      "mousemove",
      (event) => (window.__obaPointerProbe ??= event.clientX),
      { once: true },
    );
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 100,
    y: 1,
  });
  return (await poll(() => page.call(() => window.__obaPointerProbe))) / 100;
}

const mouse = (page, type, { x, y }, { scale = 1, ...rest } = {}) =>
  page.send("Input.dispatchMouseEvent", {
    type,
    x: x / scale,
    y: y / scale,
    ...rest,
  });

// The center of the first element matching `selector` (and containing
// `text`, or with exactly that text when `exact`), scrolled into view;
// waits until it exists, is enabled, has stopped moving and is what a
// click at its center would hit. An opening accordion, for one, moves
// what it holds while it animates, and scrolling into view inside it
// shifts the rows further, so a point taken then lands on another row.
// Content arriving late moves what follows it without an animation (the
// setup's buttons under a step whose list loads): the element's box has to
// stay put for two frames.
export function elementCenter(page, selector, { text, exact = false } = {}) {
  return poll(() =>
    page.call(
      async ({ selector, text, exact }) => {
        const element = [...document.querySelectorAll(selector)].find(
          (item) =>
            !text ||
            (exact
              ? item.textContent.trim() === text
              : item.textContent.includes(text)),
        );
        if (!element || element.disabled) return null;
        const moving = document.getAnimations().some((animation) => {
          const target = animation.effect?.target;
          return (
            animation.playState === "running" &&
            animation.effect.getComputedTiming().endTime !== Infinity &&
            target?.contains?.(element)
          );
        });
        if (moving) return null;
        element.scrollIntoView({ block: "nearest" });
        const rect = element.getBoundingClientRect();
        const point = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
        const hit = document.elementFromPoint(point.x, point.y);
        if (!hit || !element.contains(hit)) return null;
        if (!document.hidden)
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        const after = element.getBoundingClientRect();
        return after.x === rect.x && after.y === rect.y ? point : null;
      },
      { selector, text, exact },
    ),
  );
}

// A left click (or `button`) at `point`.
export async function click(page, point, { scale, button = "left" } = {}) {
  for (const type of ["mousePressed", "mouseReleased"])
    await mouse(page, type, point, { scale, button, clickCount: 1 });
}

// Moves the pointer onto `point` and clicks the element under it.
export async function clickElement(
  page,
  selector,
  { text, exact, scale } = {},
) {
  const point = await elementCenter(page, selector, { text, exact });
  await mouse(page, "mouseMoved", point, { scale });
  await click(page, point, { scale });
}

export function movePointer(page, point, { scale } = {}) {
  return mouse(page, "mouseMoved", point, { scale });
}

// Moves the pointer away, then onto `point` in small steps from its left,
// so hover handlers (such as tooltips) start fresh.
export async function hover(page, point, { scale } = {}) {
  await mouse(page, "mouseMoved", { x: 1, y: 1 }, { scale });
  for (const dx of [-8, -4, 0])
    await mouse(page, "mouseMoved", { ...point, x: point.x + dx }, { scale });
}

// A press, moves and release from `from` to `to`, as a user drags to
// select text.
export async function drag(page, from, to) {
  const at = (type, { x, y }, buttons) =>
    page.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons,
      clickCount: 1,
    });
  await at("mousePressed", from, 1);
  await at("mouseMoved", { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 1);
  await at("mouseMoved", to, 1);
  await at("mouseReleased", to, 0);
}

const KEY_CODES = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Escape: 27,
  " ": 32,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
};

export const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

// Presses and releases `key` (a KeyboardEvent key). `commands`: editing
// commands the key runs, such as "selectAll" (CDP sends none by itself).
export async function pressKey(page, key, { modifiers = 0, commands } = {}) {
  const letter = /^[a-z]$/i.test(key);
  const event = {
    key,
    code: letter ? `Key${key.toUpperCase()}` : key === " " ? "Space" : key,
    windowsVirtualKeyCode: letter
      ? key.toUpperCase().charCodeAt(0)
      : KEY_CODES[key],
    modifiers,
  };
  await page.send("Input.dispatchKeyEvent", {
    ...event,
    type: "rawKeyDown",
    ...(commands ? { commands } : {}),
  });
  await page.send("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
}

// Types `text` into the focused field, or into `selector` after focusing it.
export async function typeText(page, text, selector) {
  if (selector)
    await page.call(
      (selector) => document.querySelector(selector).focus(),
      selector,
    );
  await page.send("Input.insertText", { text });
}

// Hovers `point` and returns the text of the tooltip that opens, or "none".
// The pointer first leaves, and the previous tooltip closes, so each one
// opens from scratch.
export async function hoverTooltip(page, point, { timeoutMs = 5000 } = {}) {
  // Two moves: the first leaves the trigger, the second leaves the
  // tooltip's pointer grace area, which closes it.
  await movePointer(page, { x: 2, y: 2 });
  await movePointer(page, { x: 1, y: 1 });
  await poll(() =>
    page.call(() => !document.querySelector('[role="tooltip"]')),
  );
  await hover(page, point);
  return poll(
    () =>
      page.call(() => document.querySelector('[role="tooltip"]')?.textContent),
    timeoutMs,
  ).catch(() => "none");
}
