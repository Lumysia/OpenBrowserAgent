import { setTimeout as delay } from "node:timers/promises";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { launchExtension, poll } from "./chromium.mjs";
import { providerFixture } from "./provider-fixtures.ts";

// The one setup every browser test builds on: a local fixture server (for
// the model and the test pages), the production build in Chromium, its
// options page, and storage seeded before the test starts.

// Per-test timeout; OBA_TEST_TIMEOUT (ms) raises it on slow machines.
export const BROWSER_TEST_TIMEOUT =
  Number(process.env.OBA_TEST_TIMEOUT) || 240000;

// How long a test watches for something that must not happen when the
// product gives no signal that it decided against it.
export const QUIET_MS = 500;

// Resolves with `getValue()` once it stayed the same for `quietMs`; rejects
// as soon as it changes.
export async function unchangedFor(getValue, quietMs = QUIET_MS) {
  const value = await getValue();
  const end = Date.now() + quietMs;
  while (Date.now() < end) {
    await delay(50);
    const now = await getValue();
    if (now !== value)
      throw new Error(`Changed while it had to stay: ${value} -> ${now}`);
  }
  return value;
}

// The stored provider record for the fixture server (OpenAI-compatible).
export function fixtureProvider(baseUrl, extra = {}) {
  return {
    id: "fixture",
    type: "openai",
    baseUrl: `${baseUrl}/v1`,
    models: [{ id: "fixture", name: "fixture" }],
    ...extra,
  };
}

// Merges `change` into the stored preferences, as a settings change does.
export function setPreferences(page, change) {
  return page.call(
    async ({ key, change }) => {
      const { [key]: preferences } = await chrome.storage.local.get(key);
      await chrome.storage.local.set({ [key]: { ...preferences, ...change } });
    },
    { key: STORAGE_KEYS.preferences, change },
  );
}

// Starts the fixture server with `handle(request, response, requests)` (none:
// every request gets a 404), launches the extension with `launch` options
// (plus `args`), opens its options page, and stores `storage(baseUrl)` there.
// `close` stops both, also after a failed start.
export async function startExtension({
  handle = (_request, response) => response.writeHead(404).end(),
  storage,
  launch = {},
  args = [],
} = {}) {
  const fixture = await providerFixture(handle);
  let browser;
  const close = async () => {
    try {
      await browser?.close();
    } finally {
      await fixture.close();
    }
  };
  try {
    browser = await launchExtension({
      ...launch,
      args: [...(launch.args || []), ...args],
    });
    const extensionUrl = (path) => `chrome-extension://${browser.id}/${path}`;
    const options = await browser.open(extensionUrl("options.html"));
    if (storage)
      await options.call(
        (items) => chrome.storage.local.set(items),
        storage(fixture.baseUrl),
      );
    return {
      browser,
      fixture,
      options,
      extensionUrl,
      close,
      // A page of the fixture server; another host name makes it another
      // site.
      url: (path, host = "127.0.0.1") =>
        fixture.baseUrl.replace("127.0.0.1", host) + path,
      setPreferences: (change) => setPreferences(options, change),
      // The background's service worker.
      worker: () =>
        browser.attach(
          (url) => url === extensionUrl("background.js"),
          "service_worker",
        ),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

// Answers fixture page requests from `pages[path]`: HTML, or
// `{ html, headers }` (`html` may be any text or a Buffer, such as a video,
// which is served in the ranges a media element asks for). Returns false
// for other paths.
export function servePages(pages, request, response) {
  const page = pages[new URL(request.url, "http://host").pathname];
  if (page === undefined) return false;
  const { html, headers } = typeof page === "string" ? { html: page } : page;
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers?.range || "");
  if (Buffer.isBuffer(html) && range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : html.length - 1;
    response
      .writeHead(206, {
        "Content-Type": "text/html",
        ...headers,
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${html.length}`,
      })
      .end(html.subarray(start, end + 1));
    return true;
  }
  response
    .writeHead(200, {
      "Content-Type": "text/html",
      ...(Buffer.isBuffer(html) && { "Accept-Ranges": "bytes" }),
      ...headers,
    })
    .end(html);
  return true;
}

// Waits until the extension registered the page script `script` (a file
// such as SMART_BAR_SCRIPT.trigger; the smart bar's once it is turned on).
export function contentScriptsRegistered(page, script) {
  return poll(() =>
    page.call(
      async (script) =>
        (await chrome.scripting.getRegisteredContentScripts()).some(
          (registered) => registered.js?.includes(script),
        ),
      script,
    ),
  );
}
