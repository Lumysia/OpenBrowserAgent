import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { clickElement, pressKey } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { pageTranslateEnUS as messages } from "../src/shared/locales/page-translate/en-US.ts";
import { formatMessage } from "../src/shared/text.ts";

// The engine setting in Settings, and the free Google and Microsoft engines
// against fake services: the background's requests to their hosts are
// answered here (CDP Fetch on the service worker), nothing goes out.
const HOSTS = [
  "https://translate-pa.googleapis.com/*",
  "https://translate.googleapis.com/*",
  "https://edge.microsoft.com/*",
];

function serveEngines(worker, handle) {
  const requests = [];
  worker.on("Fetch.requestPaused", ({ requestId, request }) => {
    requests.push(request);
    const { status = 200, type = "application/json", body } = handle(request);
    worker
      .send("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: "Content-Type", value: type },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(body).toString("base64"),
      })
      .catch(() => undefined);
  });
  return worker
    .send("Fetch.enable", {
      patterns: HOSTS.map((urlPattern) => ({ urlPattern })),
    })
    .then(() => requests);
}

// What the fake services answer: every text prefixed with the service.
const translated = (prefix, texts) => texts.map((text) => `${prefix} ${text}`);

const clickAt = (page, selector, text) =>
  clickElement(page, selector, { text, exact: true });

test("translation engines", { timeout: BROWSER_TEST_TIMEOUT }, async (t) => {
  const session = await startPageTranslate({
    pages: { "/article": articlePage({ paragraphs: 3 }) },
    answer: fixtureTranslator(),
  });
  const { browser, url, clickMenu, worker, extensionUrl } = session;
  // Each test has its own tab, at its own address.
  let tabs = 0;
  const nextUrl = () => url(`/article?tab=${++tabs}`);
  let mode = "ok";
  const requests = await serveEngines(worker, (request) => {
    if (request.url.includes("translateHtml")) {
      if (mode === "key-refused")
        return {
          status: 400,
          body: '[3,"API key not valid.",[["type.googleapis.com/google.rpc.ErrorInfo",["API_KEY_INVALID"]]]]',
        };
      const [[texts]] = JSON.parse(request.postData);
      return { body: JSON.stringify([translated("DE-html:", texts), []]) };
    }
    if (request.url.includes("translate_a/t")) {
      if (mode === "limited" || mode === "all-limited")
        return { status: 429, type: "text/html", body: "<html>Sorry</html>" };
      const texts = new URLSearchParams(request.postData).getAll("q");
      return {
        body: JSON.stringify(
          translated("DE-gtx:", texts).map((text) => [text, "en"]),
        ),
      };
    }
    if (mode === "all-limited")
      return { status: 429, body: '{"error":{"code":429}}' };
    const texts = JSON.parse(request.postData);
    return {
      body: JSON.stringify(
        translated("DE-ms:", texts).map((text) => ({
          detectedLanguage: { language: "en", score: 1 },
          translations: [{ text, to: "de" }],
        })),
      ),
    };
  });
  const translatePage = async (expected) => {
    const pageUrl = nextUrl();
    const page = await browser.open(pageUrl);
    await clickMenu(pageUrl);
    const text = await poll(() => translationIn(page, "#title"));
    assert.equal(text, expected);
    return page;
  };
  try {
    await t.test("the engine setting persists, with its notice", async () => {
      const settings = await browser.open(
        extensionUrl("options.html#/page-translation"),
      );
      await clickAt(settings, '[aria-label="Translation engine"]');
      const options = await poll(() =>
        settings.call(() =>
          [...document.querySelectorAll("[role=option]")].map((option) =>
            option.textContent.trim(),
          ),
        ),
      );
      assert.deepEqual(options, Object.values(messages.engines));
      // The built-in translator says what happens where it can't translate,
      // and shows the model it falls back to.
      await clickAt(settings, "[role=option]", messages.engines.browser);
      const builtIn = await settings.call(() => "Translator" in globalThis);
      const detail = builtIn
        ? messages.engineDetails.browser
        : messages.browserMissing;
      await poll(() =>
        settings.call(
          (texts) =>
            texts.every((text) => document.body.textContent.includes(text)),
          [detail, messages.modelDescription],
        ),
      );
      await clickAt(settings, '[aria-label="Translation engine"]');
      await clickAt(settings, "[role=option]", "Google Translate (free)");
      await poll(() =>
        settings.call(() =>
          document.body.textContent.includes(
            "Page text is sent to Google to translate it.",
          ),
        ),
      );
      await settings.call(() => location.reload());
      await poll(() =>
        settings.call(
          () =>
            document
              .querySelector('[aria-label="Translation engine"]')
              ?.textContent.trim() === "Google Translate (free)",
        ),
      );
      // Target language and display are remembered too.
      await clickAt(settings, '[aria-label="Translate into"]');
      // A long list: the option is chosen with the keyboard.
      await poll(() =>
        settings.call(() => {
          const option = [...document.querySelectorAll("[role=option]")].find(
            (item) => item.textContent.trim() === "German",
          );
          option?.focus();
          return document.activeElement === option;
        }),
      );
      await pressKey(settings, "Enter");
      await poll(() =>
        settings.call(async () => {
          const { preferences } = await chrome.storage.local.get("preferences");
          return (
            preferences.pageTranslate.engine === "google" &&
            preferences.pageTranslate.targetLanguage === "de"
          );
        }),
      );
      settings.close();
    });

    await t.test("Google: translateHtml", async () => {
      const page = await translatePage("DE-html: Notes from the field");
      const bodies = requests
        .filter((item) => item.url.includes("translateHtml"))
        .map((item) => JSON.parse(item.postData));
      for (const [[, source, target], client] of bodies)
        assert.deepEqual([source, target, client], ["auto", "de", "te_lib"]);
      assert.ok(
        bodies.some(([[texts]]) => texts.includes("Notes from the field")),
      );
      // Links come back as links.
      assert.equal(
        await poll(() =>
          page.call(() =>
            document
              .querySelector("#intro > oba-translation a")
              ?.getAttribute("href"),
          ),
        ),
        "/guide",
      );
      page.close();
    });

    await t.test(
      "Google: a refused key falls back to the keyless endpoint",
      async () => {
        mode = "key-refused";
        await session.setPreferences({ targetLanguage: "fr" });
        const page = await translatePage("DE-gtx: Notes from the field");
        page.close();
      },
    );

    // The page's note, in a closed shadow root.
    const noteOn = (page, text) =>
      poll(async () => {
        const snapshot = await page.send("DOM.getDocument", {
          depth: -1,
          pierce: true,
        });
        return JSON.stringify(snapshot).includes(text);
      }, 30000);

    await t.test(
      "Google rate-limited: the page switches to Microsoft",
      async () => {
        mode = "limited";
        await session.setPreferences({ targetLanguage: "es" });
        const page = await translatePage("DE-ms: Notes from the field");
        await noteOn(
          page,
          formatMessage(messages.switched.rateLimited, {
            engine: messages.engineNames.google,
            fallback: messages.engineNames.microsoft,
          }),
        );
        page.close();
      },
    );

    await t.test("both free services failing: the page says so", async () => {
      mode = "all-limited";
      await session.setPreferences({ targetLanguage: "it" });
      const pageUrl = nextUrl();
      const page = await browser.open(pageUrl);
      await clickMenu(pageUrl);
      await noteOn(
        page,
        formatMessage(messages.errors.allFailed, {
          engine: messages.engineNames.google,
          fallback: messages.engineNames.microsoft,
        }),
      );
      await delay(200);
      assert.equal(await translationIn(page, "#title"), undefined);
      page.close();
    });

    await t.test(
      "no built-in translator in the background: the AI model translates",
      async () => {
        mode = "ok";
        await session.setPreferences({
          engine: "browser",
          targetLanguage: "fr",
        });
        // The background as in a browser without the Translator API.
        await worker.call(() => {
          self.Translator = undefined;
        });
        const page = await translatePage("FR: Notes from the field");
        await noteOn(
          page,
          formatMessage(messages.switched.unavailable, {
            engine: messages.engineNames.browser,
            fallback: messages.engineNames.model,
          }),
        );
        page.close();
      },
    );

    await t.test("Microsoft", async () => {
      mode = "ok";
      await session.setPreferences({
        engine: "microsoft",
        targetLanguage: "zh-TW",
      });
      const page = await translatePage("DE-ms: Notes from the field");
      const request = requests.findLast((item) =>
        item.url.includes("edge.microsoft.com"),
      );
      assert.equal(new URL(request.url).searchParams.get("to"), "zh-Hant");
      assert.equal(
        await page.call(
          () => document.querySelector("#title > oba-translation").lang,
        ),
        "zh-TW",
      );
      page.close();
    });
  } finally {
    await session.close();
  }
});
