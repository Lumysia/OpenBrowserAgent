import { setTimeout as delay } from "node:timers/promises";
import { SMART_BAR_MESSAGE } from "../src/shared/smart-bar-protocol.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import {
  contentScriptsRegistered,
  fixtureProvider,
  servePages,
  setPreferences,
  startExtension,
} from "./browser-harness.mjs";
import { click, drag } from "./cdp-input.mjs";
import { inShadowRoot } from "./shadow-roots.mjs";
import { nextFrames, poll } from "./chromium.mjs";
import { streamText } from "./provider-fixtures.ts";

export { click } from "./cdp-input.mjs";

// Test helpers for the smart bar on a page. The bar lives in a closed shadow
// root, out of reach of page scripts; tests reach it through CDP (a DevTools
// DOM snapshot pierces closed roots) and press it with real CDP input, which
// the page sees as trusted user input.

// The production build (`npm run build:chrome`) in Chromium, with one fixture
// server for the test pages and the model. `pages[path]`: HTML, or
// `{ html, headers }`. The model streams what `answer(prompt, write)` writes.
// `smartBar`: stored smart bar settings; none means the defaults (off).
// `launch` holds extra launchExtension options, such as browser preferences;
// `args`: extra Chromium arguments.
export async function startSmartBar({
  pages,
  answer,
  smartBar,
  launch = {},
  args,
}) {
  const session = await startExtension({
    handle: async (request, response) => {
      if (request.url.startsWith("/v1/"))
        return streamText(response, (write) =>
          answer(JSON.stringify(request.body.messages), write),
        );
      // Pages not listed are blank.
      if (!servePages(pages, request, response))
        response.writeHead(200, { "Content-Type": "text/html" }).end("");
    },
    storage: (baseUrl) => ({
      provider: { fixture: fixtureProvider(baseUrl) },
      language: "en-US",
      preferences: { selectedModelId: "fixture", smartBar },
    }),
    launch,
    args,
  });
  const { options, close } = session;
  try {
    if (smartBar?.enabled) await contentScriptsRegistered(options);
    // Counts the page scripts' requests to the background.
    const worker = await session.worker();
    await worker.call((prepare) => {
      self.prepares = 0;
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === prepare) self.prepares++;
      });
    }, SMART_BAR_MESSAGE.prepare);
    return {
      ...session,
      prepares: () => worker.call(() => self.prepares),
      updateSmartBar: async (change) =>
        setPreferences(options, {
          smartBar: { ...(await smartBarSettings(options)), ...change },
        }),
      smartBarSettings: () => smartBarSettings(options),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function smartBarSettings(options) {
  return options.call(
    async (key) => (await chrome.storage.local.get(key))[key].smartBar,
    STORAGE_KEYS.preferences,
  );
}

// How long the page may take to apply the background's answer to a
// selection. The answer leaves no other trace when it says "no bar".
export const ANSWER_QUIET_MS = 250;

// After a selection: waits until the page script read it (it does so in the
// next frame) and, when it asked the background, until the ask arrived and
// its answer had ANSWER_QUIET_MS to apply. `before` is `prepares()` from
// before the selection. Resolves with whether the page asked.
export async function selectionHandled(session, page, before) {
  await nextFrames(page);
  const asked = await poll(
    async () => (await session.prepares()) > before,
    ANSWER_QUIET_MS,
  ).then(
    () => true,
    () => false,
  );
  if (asked) await delay(ANSWER_QUIET_MS);
  return asked;
}

// Selects `selector` (with `select`) and returns the bar's state once the
// page handled the selection.
export async function barAfterSelection(
  session,
  page,
  selector,
  select = selectText,
) {
  const before = await session.prepares();
  await select(page, selector);
  await selectionHandled(session, page, before);
  return barState(page);
}

// The text of a field, as the page sees it.
export function fieldValue(page, selector) {
  return page.call((selector) => {
    const element = document.querySelector(selector);
    return "value" in element ? element.value : element.textContent;
  }, selector);
}

// Runs `fn(root, argument)` in the page with the bar's shadow root, or null
// when the page has no bar.
export function inSmartBar(page, fn, argument) {
  return inShadowRoot(page, isSmartBarRoot, fn, argument);
}

// The page's own bar (frames have their own): a closed root holding a whole
// html document. The host's tag says nothing; pages could imitate it.
function isSmartBarRoot(root) {
  return (
    root.shadowRootType === "closed" && root.children?.[0]?.nodeName === "HTML"
  );
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

export { pressKey } from "./cdp-input.mjs";

// A click on an empty spot, so a shown bar hides like after a user's click.
export async function clickAway(page) {
  await page.send("Page.bringToFront");
  await poll(() => page.call(() => !document.hidden));
  await click(page, { x: 600, y: 560 });
  await nextFrames(page);
}

// A real mouse drag across the element's first line, from its first
// character to its last one in view.
export async function selectText(page, selector) {
  await clickAway(page);
  const { from, to } = await page.call((selector) => {
    const element = document.querySelector(selector);
    // Its start in view, also when the viewport is narrower than it (the
    // side panel is open).
    element.scrollIntoView({ block: "nearest", inline: "start" });
    const width = document.documentElement.clientWidth;
    // Each end a quarter into its character: a fixed inset passes the middle
    // of narrow glyphs (such as a final "l"), which leaves them unselected.
    const glyphs = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());)
      for (let index = 0; index < node.length; index++) {
        if (/\s/.test(node.data[index])) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const box = range.getBoundingClientRect();
        if (box.width && box.right <= width) glyphs.push(box);
      }
    const first = glyphs[0];
    const line = glyphs.filter((box) => box.top === first?.top);
    const last = line.at(-1);
    if (first)
      return {
        from: {
          x: first.left + first.width / 4,
          y: first.top + first.height / 2,
        },
        to: { x: last.right - last.width / 4, y: first.top + first.height / 2 },
      };
    // Fields and other elements without text nodes.
    const box = element.getBoundingClientRect();
    const y = box.top + 10;
    return {
      from: { x: box.left + 2, y },
      to: { x: Math.min(box.right, width) - 2, y },
    };
  }, selector);
  await drag(page, from, to);
  // The page script reads the selection in the next frame.
  await nextFrames(page);
}

// A real mouse drag across the first line of a frame's text (body and
// paragraph margins at their defaults).
export async function selectInFrame(page, selector) {
  const box = await page.call((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.left + 10, y: rect.top + 30 };
  }, selector);
  await clickAway(page);
  await drag(page, box, { x: box.x + 200, y: box.y });
}
