import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";

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

try {
  // A fresh profile has no provider, so the side panel shows its setup screen.
  await checkPage("sidepanel.html", "#root button");
  await checkPage("options.html", "#root .nav-link");
} finally {
  await browser.close();
}
