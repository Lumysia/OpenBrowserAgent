import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { configureComposer, submitComposer } from "./browser-composer.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { launchExtension, poll, settled } from "./chromium.mjs";
import {
  pieces,
  providerFixture,
  reply,
  streamText,
} from "./provider-fixtures.ts";

// UI smoke (npm run test:browser): needs `npm run build:chrome` and
// Chromium. It catches what unit tests cannot: manifest, bundling and
// module-init crashes in the real extension pages.

// Installed before page scripts run: records uncaught errors, rejections and
// console.error calls.
function recordErrors() {
  const errors = (globalThis.__smokeErrors = []);
  const describe = (value) =>
    value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  addEventListener("error", (event) => errors.push(describe(event.error)));
  addEventListener("unhandledrejection", (event) =>
    errors.push(describe(event.reason)),
  );
  const consoleError = console.error;
  console.error = (...args) => {
    errors.push(args.map(describe).join(" "));
    consoleError(...args);
  };
}

async function checkPage(browser, path, readySelector) {
  const page = await browser.open(`chrome-extension://${browser.id}/${path}`);
  // The init script only applies after Page.enable.
  await page.send("Page.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${recordErrors})()`,
  });
  await page.send("Page.reload");
  await poll(
    () =>
      page.call(
        (selector) =>
          !!globalThis.__smokeErrors && !!document.querySelector(selector),
        readySelector,
      ),
    20000,
  );
  // Let storage loads and other effects settle before reading errors.
  await settled(page);
  assert.deepEqual(await page.call(() => globalThis.__smokeErrors), []);
}

// With chat sync on, the first message of a new chat opens that chat. Sync
// bookkeeping once re-stored an older chat list mid-send, and the panel fell
// back to the empty start page.
async function checkSyncedSend(browser) {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "Synced reply." }),
  );
  try {
    const page = await browser.open(
      `chrome-extension://${browser.id}/sidepanel.html`,
    );
    await page.call(
      ({ backend, settings }) =>
        chrome.storage.local.set({
          [backend]: "browser-sync",
          [settings]: { syncChats: true },
        }),
      {
        backend: STORAGE_KEYS.activeSyncBackendId,
        settings: STORAGE_KEYS.syncDataSettings,
      },
    );
    await configureComposer(page, {
      provider: "openai",
      model: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
      apiKey: "test-key",
    });
    // Sync is running: a round stored its state.
    await poll(() =>
      page.call(
        async (prefix) =>
          Object.keys(await chrome.storage.local.get(null)).some((key) =>
            key.startsWith(prefix),
          ),
        `${STORAGE_KEYS.syncState}:`,
      ),
    );
    await submitComposer(page, "First synced message");
    await poll(
      () =>
        page.call(() =>
          document
            .querySelector(".messages-content")
            ?.textContent?.includes("Synced reply."),
        ),
      10000,
    ).catch(async (error) => {
      console.log(
        "shown:",
        await page.call(() =>
          document.querySelector("#root")?.textContent?.slice(0, 200),
        ),
        "requests:",
        fixture.requests.length,
      );
      throw error;
    });
  } finally {
    await fixture.close();
  }
}

// A Markdown answer streamed in small chunks renders in the real side panel
// under the extension CSP: CJK bold, math, footnotes, and a remote image that
// waits for a click instead of loading. The multi-line prompt keeps its line
// breaks in the user bubble, without the surrounding blank lines.
async function checkStreamedMarkdown(browser) {
  let imageRequests = 0;
  const answer = [
    "**你好：**文字 costs $5 and $10, and $x^2$ holds.[^1]",
    "1. first\n\n2. second",
    "```ts\nconst a = 1;\n```",
    "![chart](BASE/chart.png?d=secret)",
    "[^1]: A note.",
  ].join("\n\n");
  const fixture = await providerFixture(async (request, response) => {
    if (request.url.startsWith("/chart.png")) {
      imageRequests++;
      response.writeHead(404).end();
      return;
    }
    await streamText(
      response,
      pieces(answer.replace("BASE", fixture.baseUrl), 7),
      { delayMs: 10 },
    );
  });
  try {
    const page = await browser.open(
      `chrome-extension://${browser.id}/sidepanel.html`,
    );
    await page.send("Page.enable");
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(${recordErrors})(); document.addEventListener("securitypolicyviolation", (event) => globalThis.__smokeErrors.push("CSP " + event.violatedDirective));`,
    });
    await configureComposer(page, {
      provider: "openai",
      model: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
      apiKey: "test-key",
    });
    await settled(page);
    await submitComposer(page, "\nRender Markdown\n\nas a list\n");
    await poll(
      () =>
        page.call(
          () =>
            !!document.querySelector(".assistant-actions") &&
            !!document.querySelector(".markdown .footnotes"),
        ),
      20000,
    );
    const rendered = await page.call(() => ({
      bold: [...document.querySelectorAll(".markdown strong")].map(
        (node) => node.textContent,
      ),
      prices: document.body.innerText.includes("costs $5 and $10"),
      math: document.querySelectorAll(".markdown .katex").length,
      lists: document.querySelectorAll(".markdown ol > li").length,
      code: !!document.querySelector(".markdown pre code.hljs"),
      blockedImage: !!document.querySelector(
        ".markdown button[data-image-src]",
      ),
      images: document.querySelectorAll(".markdown img").length,
      userText: document.querySelector(".user-bubble")?.innerText,
      errors: globalThis.__smokeErrors,
    }));
    assert.deepEqual(rendered, {
      bold: ["你好："],
      prices: true,
      math: 1,
      lists: 3,
      code: true,
      blockedImage: true,
      images: 0,
      userText: "Render Markdown\n\nas a list",
      errors: [],
    });
    assert.equal(imageRequests, 0);
  } finally {
    await fixture.close();
  }
}

test("browser smoke", { timeout: BROWSER_TEST_TIMEOUT }, async (t) => {
  const browser = await launchExtension();
  try {
    // A fresh profile has no provider, so the side panel shows its setup
    // screen.
    await t.test("the side panel renders without errors", () =>
      checkPage(browser, "sidepanel.html", "#root button"),
    );
    await t.test("the options page renders without errors", () =>
      checkPage(browser, "options.html", "#root .nav-link"),
    );
    await t.test("a synced new chat shows its first message", () =>
      checkSyncedSend(browser),
    );
    await t.test("a streamed Markdown answer renders", () =>
      checkStreamedMarkdown(browser),
    );
  } finally {
    await browser.close();
  }
});
