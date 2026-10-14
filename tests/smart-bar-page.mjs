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
export async function inSmartBar(page, fn, argument) {
  const options = { awaitPromise: true, returnByValue: true };
  const objectGroup = "smart-bar-test";
  let object;
  // The snapshot's node ids go stale when the bar's host moves (into or out
  // of a modal dialog) right after it was taken.
  for (let attempt = 0; !object; attempt++) {
    const { root } = await page.send("DOM.getDocument", {
      depth: -1,
      pierce: true,
    });
    const shadow = findShadowRoot(root);
    if (!shadow)
      return value(
        await page.send("Runtime.evaluate", {
          ...options,
          expression: `(${fn})(null, ${JSON.stringify(argument) ?? "undefined"})`,
        }),
      );
    object = await page
      .send("DOM.resolveNode", { nodeId: shadow.nodeId, objectGroup })
      .then(
        (result) => result.object,
        (error) => {
          if (attempt === 2) throw error;
        },
      );
  }
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

// The page's own bar (frames have their own): a closed root holding a whole
// html document. The host's tag says nothing; pages could imitate it.
function findShadowRoot(node) {
  const bar = node.shadowRoots?.find(
    (root) =>
      root.shadowRootType === "closed" &&
      root.children?.[0]?.nodeName === "HTML",
  );
  if (bar) return bar;
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
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

// A real mouse drag across the element's first line.
export async function selectText(page, selector) {
  await clickAway(page);
  const rect = await page.call((selector) => {
    const element = document.querySelector(selector);
    // Its start in view, also when the viewport is narrower than it (the
    // side panel is open).
    element.scrollIntoView({ block: "nearest", inline: "start" });
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: Math.min(box.right, document.documentElement.clientWidth),
      top: box.top,
    };
  }, selector);
  const y = rect.top + 10;
  await drag(page, { x: rect.left + 2, y }, { x: rect.right - 2, y });
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
