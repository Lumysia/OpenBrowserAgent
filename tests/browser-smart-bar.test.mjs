import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture } from "./provider-fixtures.mjs";

// The smart bar in the production build: off by default, turned on through
// the options page, streaming a fixture model's answer and writing results
// back into fields. Needs `npm run build:chrome` and Chromium.
const PAGE = `<!doctype html><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p,textarea,input,div{display:block;width:420px;margin:0 0 24px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>
<textarea id="area" rows="2">hello wrold</textarea>
<div id="editor" contenteditable="true">teh draft</div>
<input id="controlled" value="recieve">
<input id="password" type="password" value="secretpassword">
<script>
  // Like a framework-controlled input: state follows input events only.
  window.inputEvents = 0;
  window.controlledState = "recieve";
  document.getElementById("controlled").addEventListener("input", (event) => {
    window.inputEvents++;
    window.controlledState = event.target.value;
  });
</script>`;

const FIXES = {
  "hello wrold": "hello world",
  "teh draft": "the draft",
  recieve: "receive",
};

test("smart bar", { timeout: 240000 }, async (t) => {
  let release;
  const released = new Promise((resolve) => (release = resolve));
  const fixture = await providerFixture(async (request, response) => {
    if (!request.url.startsWith("/v1/")) {
      response.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
      return;
    }
    const prompt = JSON.stringify(request.body.messages);
    const fixed = Object.entries(FIXES).find(([wrong]) =>
      prompt.includes(`\\n${wrong}\\n`),
    );
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (content, finish = null) =>
      response.write(
        `data: ${JSON.stringify({
          id: "fixture",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: content, finish_reason: finish }],
        })}\n\n`,
      );
    if (fixed) send({ content: fixed[1] });
    else {
      // Explain: the second half waits for the test, proving the card
      // shows text while the answer still streams.
      send({ content: "Streamed explanation" });
      await released;
      send({ content: " finished." });
    }
    send({}, "stop");
    response.end("data: [DONE]\n\n");
  });
  // The page server is the fixture server: GET requests have no JSON body.
  const pageUrl = `${fixture.baseUrl}/page`;
  const listedUrl = pageUrl.replace("127.0.0.1", "localhost");
  let listed;
  const browser = await launchExtension({
    headed: process.env.OBA_HEADLESS !== "1",
  });
  const extensionUrl = (path) => `chrome-extension://${browser.id}/${path}`;
  try {
    const options = await browser.open(extensionUrl("options.html"));
    await options.call(async (baseUrl) => {
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
        preferences: { selectedModelId: "fixture" },
      });
    }, fixture.baseUrl);
    const page = await browser.open(pageUrl);

    await t.test("off by default: no bar on selection", async () => {
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("turned on in the options page, the bar shows", async () => {
      await options.send("Page.navigate", {
        url: extensionUrl("options.html#/smart-bar"),
      });
      const enable = await poll(() =>
        options.call(() => {
          const label = [...document.querySelectorAll("label")].find(
            (item) => item.textContent === "Show the smart bar",
          );
          const button = label && document.getElementById(label.htmlFor);
          if (!button) return undefined;
          const rect = button.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }),
      );
      await click(options, enable);
      // The page was open before: the background injects the page script.
      await poll(async () => {
        await selectText(page, "#text");
        return (await barState(page)) === "toolbar";
      });
    });

    await t.test("Explain streams the fixture answer", async () => {
      await clickInBar(page, '[aria-label="Explain"]');
      await poll(async () =>
        (await resultText(page)).includes("Streamed explanation"),
      );
      assert.equal(await barHas(page, "button", "Stop"), true);
      release();
      await poll(async () =>
        (await resultText(page)).includes("Streamed explanation finished."),
      );
      const explain = fixture.requests.find((request) =>
        JSON.stringify(request.body).includes("Explain the text below"),
      );
      assert.match(
        JSON.stringify(explain.body),
        /The quick brown fox jumps over the lazy dog\./,
      );
    });

    for (const [selector, kind] of [
      ["#area", "textarea"],
      ["#editor", "contenteditable"],
    ])
      await t.test(`Replace in a ${kind}, undone by Ctrl+Z`, async () => {
        const before = await fieldValue(page, selector);
        await replaceWithFix(page, selector);
        assert.equal(await fieldValue(page, selector), FIXES[before]);
        await page.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          modifiers: 2,
          key: "z",
          code: "KeyZ",
          windowsVirtualKeyCode: 90,
          commands: ["undo"],
        });
        await page.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          modifiers: 2,
          key: "z",
          code: "KeyZ",
          windowsVirtualKeyCode: 90,
        });
        await poll(async () => (await fieldValue(page, selector)) === before);
      });

    await t.test("a controlled input gets an input event", async () => {
      await replaceWithFix(page, "#controlled");
      assert.deepEqual(
        await page.call(() => [window.controlledState, window.inputEvents > 0]),
        ["receive", true],
      );
    });

    await t.test("no bar in password fields", async () => {
      await selectText(page, "#password");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("Hide on this site stops it", async () => {
      await selectText(page, "#text");
      await poll(async () => (await barState(page)) === "toolbar");
      await clickInBar(page, '[aria-label="Smart bar options"]');
      await clickInBar(page, ".smart-bar-menu-item");
      await poll(async () => (await barState(page)) === "none");
      await poll(() =>
        options.call(
          async () =>
            (
              await chrome.storage.local.get("preferences")
            ).preferences.smartBar.blockedHosts.join() ===
            "docs.google.com,127.0.0.1",
        ),
      );
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("allow-list mode shows only on listed sites", async () => {
      await options.call(async () => {
        const { preferences } = await chrome.storage.local.get("preferences");
        await chrome.storage.local.set({
          preferences: {
            ...preferences,
            smartBar: {
              ...preferences.smartBar,
              siteMode: "allowList",
              allowedHosts: ["localhost"],
            },
          },
        });
      });
      listed = await browser.open(listedUrl);
      await poll(async () => {
        await selectText(listed, "#text");
        return (await barState(listed)) === "toolbar";
      });
      await page.send("Page.reload");
      await poll(() => page.call(() => document.readyState === "complete"));
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("Ask and Continue hand off to the side panel", async () => {
      await selectText(listed, "#text");
      await clickInBar(listed, '[aria-label="Ask"]');
      // The click's user gesture opens the window's real side panel.
      const panel = await browser.attach(
        (url) => url === extensionUrl("sidepanel.html"),
      );
      await poll(() =>
        panel.call(() =>
          document
            .querySelector(".composer-box textarea")
            ?.value.startsWith(
              "> The quick brown fox jumps over the lazy dog.",
            ),
        ),
      );
      await selectText(listed, "#text");
      await clickInBar(listed, '[aria-label="Explain"]');
      await poll(async () => (await resultText(listed)).includes("finished."));
      await clickInBar(listed, '[aria-label="Continue in side panel"]');
      await poll(() =>
        panel.call(() =>
          document
            .querySelector(".messages-content")
            ?.textContent?.includes("Streamed explanation finished."),
        ),
      );
    });

    await t.test("shortcut mode shows the bar only on command", async () => {
      await options.call(async () => {
        const { preferences } = await chrome.storage.local.get("preferences");
        await chrome.storage.local.set({
          preferences: {
            ...preferences,
            smartBar: { ...preferences.smartBar, trigger: "shortcut" },
          },
        });
      });
      await selectText(listed, "#text");
      await delay(600);
      assert.equal(await barState(listed), "none");
      // What the background sends for the keyboard command.
      await options.call(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.sendMessage(tab.id, {
          type: "smart-bar:show-for-selection",
        });
      }, listedUrl);
      await poll(async () => (await barState(listed)) === "toolbar");
      assert.equal(
        await listed.call(
          () =>
            document.querySelector("oba-smart-bar").shadowRoot.activeElement
              ?.ariaLabel,
        ),
        "Ask",
      );
    });
  } finally {
    release();
    await browser.close();
    await fixture.close();
  }
});

async function replaceWithFix(page, selector) {
  await selectText(page, selector);
  await poll(async () => (await barState(page)) === "toolbar");
  await clickInBar(page, '[aria-label="Fix spelling & grammar"]');
  await poll(() => barHas(page, "button", "Replace"));
  await clickInBar(page, "button", "Replace");
  await poll(async () => (await barState(page)) === "none");
}

// A real mouse drag across the element's first line.
async function selectText(page, selector) {
  await page.send("Page.bringToFront");
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
  // Away first, so a shown bar hides like after a user's click.
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 600,
    y: 560,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 600,
    y: 560,
    button: "left",
    clickCount: 1,
  });
  await mouse("mousePressed", rect.left + 2, 1);
  await mouse("mouseMoved", (rect.left + rect.right) / 2, 1);
  await mouse("mouseMoved", rect.right - 2, 1);
  await mouse("mouseReleased", rect.right - 2, 0);
  await delay(300);
}

async function click(page, { x, y }) {
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
async function clickInBar(page, selector, text) {
  let last;
  const point = await poll(async () => {
    const current = await page.call(
      ({ selector, text }) => {
        const root = document.querySelector("oba-smart-bar")?.shadowRoot;
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

function barState(page) {
  return page.call(() => {
    const root = document.querySelector("oba-smart-bar")?.shadowRoot;
    if (root?.querySelector(".smart-bar-result")) return "result";
    if (root?.querySelector('[role="toolbar"]')) return "toolbar";
    return "none";
  });
}

function barHas(page, selector, text) {
  return page.call(
    ({ selector, text }) =>
      [
        ...(document
          .querySelector("oba-smart-bar")
          ?.shadowRoot?.querySelectorAll(selector) || []),
      ].some((item) => item.textContent.trim() === text),
    { selector, text },
  );
}

function resultText(page) {
  return page.call(
    () =>
      document
        .querySelector("oba-smart-bar")
        ?.shadowRoot?.querySelector(".smart-bar-result-text")?.textContent ||
      "",
  );
}

function fieldValue(page, selector) {
  return page.call((selector) => {
    const element = document.querySelector(selector);
    return "value" in element ? element.value : element.textContent;
  }, selector);
}
