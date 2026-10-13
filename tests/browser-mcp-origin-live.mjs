// Live check against TinyFish's keyless MCP endpoint, which rejects requests
// with an Origin header: an MCP `initialize` from the built extension succeeds
// while the built-in's "send without browser Origin" option is on and fails
// once it is off. Three requests in total (the keyless tier allows about 30 a
// minute). Needs network access; run with `npm run test:browser:mcp-origin`.
import assert from "node:assert/strict";
import { launchExtension, poll } from "./chromium.mjs";

const URL_ = "https://agent.tinyfish.ai/mcp";
const RULE_FILTER = "^https:\\/\\/agent\\.tinyfish\\.ai\\/mcp$";

// Evaluated in an extension context: one `initialize`, reduced to what the
// check needs.
const initialize = async (url) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-TinyFish-Access-Mode": "keyless",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "OpenBrowserAgent", version: "0.1.0" },
      },
    }),
  });
  const text = await response.text();
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let body = {};
  try {
    body = json ? JSON.parse(json) : {};
  } catch {
    /* not JSON */
  }
  return {
    status: response.status,
    protocolVersion: body.result?.protocolVersion,
    error: body.error?.message,
  };
};

const hasRule = (filter) =>
  chrome.declarativeNetRequest
    .getDynamicRules()
    .then((rules) =>
      rules.some((rule) => rule.condition.regexFilter === filter),
    );

const browser = await launchExtension({
  headed: process.env.OBA_HEADLESS !== "1",
});
try {
  const page = await browser.open(
    `chrome-extension://${browser.id}/options.html`,
  );
  // The background adds the built-in's rule at startup.
  await poll(() => page.call(hasRule, RULE_FILTER), 10000);

  const fromPage = await page.call(initialize, URL_);
  assert.ok(fromPage.protocolVersion, JSON.stringify(fromPage));
  console.log("ok initialize from an extension page with the option on");

  const worker = await browser.attach(
    (url) => url.startsWith(`chrome-extension://${browser.id}/`),
    "service_worker",
  );
  const fromWorker = await worker.call(initialize, URL_);
  assert.ok(fromWorker.protocolVersion, JSON.stringify(fromWorker));
  console.log("ok initialize from the service worker with the option on");

  await page.call(() =>
    chrome.storage.local.set({
      "mcp-servers": [{ id: "builtin_tinyfish", omitOrigin: false }],
    }),
  );
  await poll(async () => !(await page.call(hasRule, RULE_FILTER)), 10000);
  const without = await page.call(initialize, URL_);
  assert.equal(without.protocolVersion, undefined, JSON.stringify(without));
  assert.match(String(without.error), /Browser-origin requests/);
  console.log("ok the server rejects the request with the option off");
} finally {
  await browser.close();
}
