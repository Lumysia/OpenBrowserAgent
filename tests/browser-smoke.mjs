import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { configureComposer, submitComposer } from "./browser-composer.mjs";
import { providerFixture, reply } from "./provider-fixtures.ts";

// Opt-in UI smoke (npm run test:browser): needs `npm run build:chrome` and
// Chromium (CHROMIUM or /usr/bin/chromium). It catches what unit tests cannot:
// manifest, bundling and module-init crashes in the real extension pages.
// Set OBA_HEADLESS=0 to watch it run.
const browser = await launchExtension({
  headed: process.env.OBA_HEADLESS === "0",
});

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

async function checkPage(path, readySelector) {
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
  await delay(1000);
  assert.deepEqual(await page.call(() => globalThis.__smokeErrors), []);
  console.log(`ok ${path}`);
}

// With chat sync on, the first message of a new chat opens that chat. Sync
// bookkeeping once re-stored an older chat list mid-send, and the panel fell
// back to the empty start page.
async function checkSyncedSend() {
  const fixture = await providerFixture((request, response) =>
    reply(response, request.protocol, { text: "Synced reply." }),
  );
  try {
    const page = await browser.open(
      `chrome-extension://${browser.id}/sidepanel.html`,
    );
    await page.call(() =>
      chrome.storage.local.set({
        "active-sync-backend-id": "browser-sync",
        "sync-data-settings": { syncChats: true },
      }),
    );
    await configureComposer(page, {
      provider: "openai",
      model: "fixture",
      baseUrl: `${fixture.baseUrl}/v1`,
      apiKey: "test-key",
    });
    await delay(1000);
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
    console.log("ok a synced new chat shows its first message");
  } finally {
    await fixture.close();
  }
}

// A Markdown answer streamed in small chunks renders in the real side panel
// under the extension CSP: CJK bold, math, footnotes, and a remote image that
// waits for a click instead of loading. The multi-line prompt keeps its line
// breaks in the user bubble, without the surrounding blank lines.
async function checkStreamedMarkdown() {
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
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const text = answer.replace("BASE", fixture.baseUrl);
    for (let index = 0; index < text.length; index += 7) {
      const content = text.slice(index, index + 7);
      response.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`,
      );
      await delay(10);
    }
    response.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
    response.end();
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
    await delay(1000);
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
    console.log("ok a streamed Markdown answer renders");
  } finally {
    await fixture.close();
  }
}

try {
  // A fresh profile has no provider, so the side panel shows its setup screen.
  await checkPage("sidepanel.html", "#root button");
  await checkPage("options.html", "#root .nav-link");
  await checkSyncedSend();
  await checkStreamedMarkdown();
} finally {
  await browser.close();
}
