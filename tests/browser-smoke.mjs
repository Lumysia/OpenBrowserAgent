import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { configureComposer, submitComposer } from "./browser-composer.mjs";
import { providerFixture, reply } from "./provider-fixtures.mjs";

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

try {
  // A fresh profile has no provider, so the side panel shows its setup screen.
  await checkPage("sidepanel.html", "#root button");
  await checkPage("options.html", "#root .nav-link");
  await checkSyncedSend();
} finally {
  await browser.close();
}
