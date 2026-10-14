import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  barHas,
  barState,
  clickInBar,
  inSmartBar,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// Reading aloud: each part of a mixed-language text in its own language.
// Headless Chromium refuses to speak, so the test replaces the Web Speech
// API in the extension's content script world with a recorder.
const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p{width:420px;margin:0 0 24px}</style>
<p id="text">今天天气很好。我们去公园散步吧。</p>`;

const TRANSLATION =
  "The weather is lovely today. Let's take a walk in the park, 散步 as they say.";

// Runs in the content script world: records what would be spoken.
function stubSpeech() {
  class Utterance extends EventTarget {
    constructor(text) {
      super();
      this.text = text;
      this.lang = "";
      this.voice = null;
    }
  }
  const voice = (name, lang) => ({
    name,
    lang,
    localService: true,
    default: false,
  });
  const synthesis = new EventTarget();
  globalThis.spoken = [];
  globalThis.stubVoices = [
    voice("Stub English", "en-US"),
    voice("Stub Chinese", "zh-CN"),
  ];
  synthesis.getVoices = () => globalThis.stubVoices;
  synthesis.cancel = () => undefined;
  synthesis.speak = (utterance) => {
    globalThis.spoken.push({
      text: utterance.text,
      lang: utterance.lang,
      voice: utterance.voice?.name ?? null,
    });
    setTimeout(() => utterance.dispatchEvent(new Event("end")), 10);
  };
  Object.defineProperty(globalThis, "speechSynthesis", {
    value: synthesis,
    configurable: true,
  });
  globalThis.SpeechSynthesisUtterance = Utterance;
}

test("smart bar reads aloud per language", { timeout: 240000 }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE },
    smartBar: { enabled: true },
    answer: async (_prompt, write) => write(TRANSLATION),
  });
  const { browser, url } = session;
  try {
    const page = await browser.open(url("/page"));
    await poll(async () => {
      await selectText(page, "#text");
      return (await barState(page)) === "toolbar";
    });
    // The page scripts' world, with the bar loaded into it.
    const contexts = [];
    page.on("Runtime.executionContextCreated", ({ context }) =>
      contexts.push(context),
    );
    await page.send("Runtime.enable");
    const world = await poll(() =>
      contexts.find(
        (context) =>
          context.auxData?.type === "isolated" &&
          context.origin === `chrome-extension://${browser.id}`,
      ),
    );
    const inWorld = async (fn) => {
      const { result, exceptionDetails } = await page.send("Runtime.evaluate", {
        expression: `(${fn})()`,
        contextId: world.id,
        returnByValue: true,
      });
      assert.equal(exceptionDetails, undefined);
      return result.value;
    };
    await inWorld(stubSpeech);
    const spoken = () => inWorld(() => globalThis.spoken.splice(0));
    const idle = () =>
      poll(async () =>
        inSmartBar(
          page,
          (root) => !root?.querySelector('button[aria-pressed="true"]'),
        ),
      );

    await clickInBar(page, '[aria-label="Translate"]');
    await poll(async () =>
      inSmartBar(page, (root) => !!root?.querySelector('[aria-label="Copy"]')),
    );

    await t.test("a mixed result is read in parts", async () => {
      await clickInBar(page, '[aria-label="Read result aloud"]');
      await idle();
      assert.deepEqual(await spoken(), [
        {
          text: "The weather is lovely today. Let's take a walk in the park,",
          lang: "en-US",
          voice: "Stub English",
        },
        { text: "散步", lang: "zh", voice: "Stub Chinese" },
        { text: "as they say.", lang: "en-US", voice: "Stub English" },
      ]);
    });

    await t.test("the original is read in its own language", async () => {
      await clickInBar(page, '[aria-label="Read original aloud"]');
      await idle();
      // The page says English; the text is Chinese.
      assert.deepEqual(await spoken(), [
        {
          text: "今天天气很好。 我们去公园散步吧。",
          lang: "zh",
          voice: "Stub Chinese",
        },
      ]);
      assert.equal(
        await inSmartBar(
          page,
          (root) => !!root?.querySelector(".smart-bar-result-notice"),
        ),
        false,
      );
    });

    await t.test("a missing voice is told once", async () => {
      await inWorld(() => {
        globalThis.stubVoices = globalThis.stubVoices.filter(
          (voice) => voice.lang === "en-US",
        );
      });
      await clickInBar(page, '[aria-label="Read result aloud"]');
      await idle();
      const parts = await spoken();
      assert.equal(parts.length, 3);
      // Still read, with the language set.
      assert.deepEqual(parts[1], { text: "散步", lang: "zh", voice: null });
      assert.equal(
        await barHas(
          page,
          ".smart-bar-result-notice",
          "No voice installed for Chinese.",
        ),
        true,
      );
    });
  } finally {
    await session.close();
  }
});
