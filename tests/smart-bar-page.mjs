import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture } from "./provider-fixtures.mjs";

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
  const fixture = await providerFixture(async (request, response) => {
    if (!request.url.startsWith("/v1/")) {
      const page = pages[new URL(request.url, "http://host").pathname] ?? "";
      const { html, headers } =
        typeof page === "string" ? { html: page } : page;
      response
        .writeHead(200, { "Content-Type": "text/html", ...headers })
        .end(html);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (delta, finish = null) =>
      response.write(
        `data: ${JSON.stringify({
          id: "fixture",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`,
      );
    await answer(JSON.stringify(request.body.messages), (content) =>
      send({ content }),
    );
    send({}, "stop");
    response.end("data: [DONE]\n\n");
  });
  const browser = await launchExtension({
    headed: process.env.OBA_HEADLESS !== "1",
    ...launch,
    ...(args ? { args: [...(launch.args || []), ...args] } : {}),
  }).catch(async (error) => {
    await fixture.close();
    throw error;
  });
  const close = async () => {
    await browser.close();
    await fixture.close();
  };
  const extensionUrl = (path) => `chrome-extension://${browser.id}/${path}`;
  try {
    const options = await browser.open(extensionUrl("options.html"));
    await options.call(
      async ({ baseUrl, smartBar }) => {
        await chrome.storage.local.set({
          provider: {
            fixture: {
              id: "fixture",
              type: "openai",
              baseUrl: `${baseUrl}/v1`,
              models: [{ id: "fixture", name: "fixture" }],
            },
          },
          language: "en-US",
          preferences: { selectedModelId: "fixture", smartBar },
        });
      },
      { baseUrl: fixture.baseUrl, smartBar },
    );
    if (smartBar?.enabled)
      await poll(() =>
        options.call(
          async () =>
            (await chrome.scripting.getRegisteredContentScripts()).length > 0,
        ),
      );
    // Counts the page scripts' requests to the background.
    const worker = await browser.attach(
      (url) => url === extensionUrl("background.js"),
      "service_worker",
    );
    await worker.call(() => {
      self.prepares = 0;
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "smart-bar:prepare") self.prepares++;
      });
    });
    return {
      browser,
      fixture,
      options,
      extensionUrl,
      close,
      // A test page; another host name makes it another site.
      url: (path, host = "127.0.0.1") =>
        fixture.baseUrl.replace("127.0.0.1", host) + path,
      prepares: () => worker.call(() => self.prepares),
      updateSmartBar: (change) =>
        options.call(async (change) => {
          const { preferences } = await chrome.storage.local.get("preferences");
          await chrome.storage.local.set({
            preferences: {
              ...preferences,
              smartBar: { ...preferences.smartBar, ...change },
            },
          });
        }, change),
      smartBarSettings: () =>
        options.call(
          async () =>
            (await chrome.storage.local.get("preferences")).preferences
              .smartBar,
        ),
    };
  } catch (error) {
    await close();
    throw error;
  }
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

// A real mouse drag across the first line of a frame's text (body and
// paragraph margins at their defaults).
export async function selectInFrame(page, selector) {
  const box = await page.call((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.left + 10, y: rect.top + 30 };
  }, selector);
  await clickAway(page);
  for (const [type, x, buttons] of [
    ["mousePressed", box.x, 1],
    ["mouseMoved", box.x + 200, 1],
    ["mouseReleased", box.x + 200, 0],
  ])
    await page.send("Input.dispatchMouseEvent", {
      type,
      x,
      y: box.y,
      button: "left",
      buttons,
      clickCount: 1,
    });
}
