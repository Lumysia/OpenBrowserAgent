import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { browserToolFixture } from "./browser-tool-fixture.mjs";
import { poll } from "./chromium.mjs";

// Saved result pages of real search engines (rendered DOM without scripts,
// styles or tracking attributes), served at their original URLs.
const FIXTURES = new URL("./fixtures/serp/", import.meta.url);
const expected = JSON.parse(
  await readFile(new URL("expected.json", FIXTURES), "utf8"),
);
const pages = await Promise.all(
  Object.entries(expected).map(async ([name, { url, results }]) => ({
    name,
    url,
    results,
    html: await readFile(new URL(`${name}.html`, FIXTURES)),
  })),
);
const BRAVE_SEARCH = "https://search.brave.com/search?q={searchTerms}";

// The user's default search engine, as the browser stores it.
const braveDefault = {
  default_search_provider_data: {
    template_url_data: {
      keyword: "search.brave.com",
      short_name: "Brave",
      url: BRAVE_SEARCH,
      synced_guid: "485bf7d3-0215-45af-87dc-538868000001",
      input_encodings: ["UTF-8"],
      prepopulate_id: 0,
      safe_for_autoreplace: false,
      is_active: 1,
    },
  },
};

// Answers every request to the engines' hosts: the matching saved page, or
// an empty 404 for assets. `pageFor(url)` picks the page.
function serveEngines(browser, pageFor) {
  const hosts = new Set(pages.map((page) => new URL(page.url).host));
  browser.on("Fetch.requestPaused", ({ requestId, request }) => {
    const page = pageFor(request.url);
    browser
      .send("Fetch.fulfillRequest", {
        requestId,
        responseCode: page ? 200 : 404,
        responseHeaders: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
        ],
        body: page ? page.html.toString("base64") : "",
      })
      .catch(() => undefined);
  });
  return browser.send("Fetch.enable", {
    patterns: [...hosts].map((host) => ({ urlPattern: `https://${host}/*` })),
  });
}

test(
  "search results are read from the result pages of each engine",
  { timeout: 300000 },
  async (t) => {
    const fixture = await browserToolFixture(undefined, {
      preferences: braveDefault,
    });
    t.after(() => fixture.close());
    const { browser, page } = fixture;
    let searched;
    await serveEngines(
      browser.browser,
      (url) =>
        pages.find((item) => item.url === url) ||
        (url.startsWith(BRAVE_SEARCH.split("{")[0]) ? searched : undefined),
    );

    for (const item of pages)
      await t.test(item.name, async () => {
        const results = await page.call(async (url) => {
          const tab = await chrome.tabs.create({ url, active: false });
          for (let tries = 0; tries < 200; tries++) {
            const current = await chrome.tabs.get(tab.id);
            if (current.url === url && current.status === "complete") break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["/page-agent.js"],
          });
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () =>
              globalThis.__obaPageAgent("searchResults", { limit: 10 }),
          });
          await chrome.tabs.remove(tab.id);
          return result.value;
        }, item.url);
        assert.ok(results.length >= 5, `${results.length} results`);
        assert.deepEqual(
          results.slice(0, 5).map(({ title, url }) => ({ title, url })),
          item.results,
        );
        for (const result of results) {
          assert.ok(result.title.trim());
          assert.match(result.url, /^https?:\/\//);
        }
      });

    await t.test(
      "webSearch lists the results of the default engine",
      async () => {
        searched = pages.find((item) => item.name === "brave-1");
        const tabCount = () =>
          page.call(async () => (await chrome.tabs.query({})).length);
        const before = await tabCount();
        const [text] = await fixture.run([
          {
            name: "webSearch",
            args: { query: "site:amazon.ca mini hidden camera" },
          },
        ]);
        const [first] = searched.results;
        assert.match(text, /^1\. /);
        assert.ok(
          text.startsWith(`1. ${first.title} | ${first.url}\n`),
          text.slice(0, 300),
        );
        assert.equal((text.match(/^\d+\. /gm) || []).length, 8);
        await poll(async () => (await tabCount()) === before);
      },
    );
  },
);
