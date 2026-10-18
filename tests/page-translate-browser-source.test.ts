import assert from "node:assert/strict";
import { test } from "node:test";
import { browserEngine } from "../src/background/page-translate/engines/browser";
import {
  EngineError,
  engineCacheKey,
  type EngineRequest,
} from "../src/background/page-translate/engines/types";
import {
  PAGE_TRANSLATE_CONTENT,
  PAGE_TRANSLATE_ERROR,
} from "../src/shared/page-translate/protocol";

// Which language the built-in translator takes each text to be in, without
// a language detector (one that isn't downloaded yet): what the items and
// the page declare, and what is only a hint. Like Chrome's, the fake has no
// pair from a language into itself.
async function withoutDetector(
  run: (
    translate: (
      request: Partial<EngineRequest> & Pick<EngineRequest, "items">,
    ) => Promise<Map<number, string>>,
  ) => Promise<void>,
) {
  const scope = globalThis as Record<string, unknown>;
  const primary = (tag: string) => tag.split("-")[0];
  scope.Translator = {
    availability: async (options: {
      sourceLanguage: string;
      targetLanguage: string;
    }) =>
      primary(options.sourceLanguage) === primary(options.targetLanguage)
        ? "unavailable"
        : "available",
    create: async ({ sourceLanguage }: { sourceLanguage: string }) => ({
      translate: async (text: string) => `[${sourceLanguage}>zh] ${text}`,
    }),
  };
  try {
    await run(async (request) => {
      const results = new Map<number, string>();
      await browserEngine().translate({
        target: "zh-CN",
        signal: new AbortController().signal,
        onItem: (id, text) => results.set(id, text),
        ...request,
      });
      return results;
    });
  } finally {
    delete scope.Translator;
  }
}

const unknownSource = (error: unknown) =>
  error instanceof EngineError &&
  error.kind === PAGE_TRANSLATE_ERROR.unavailable &&
  /unknown source language/.test(error.message);

test("built-in translator: a hint in the target language leaves no text as it is", () =>
  withoutDetector(async (translate) => {
    // English subtitles, short lines among them, declared by their track
    // on a site whose interface is in Chinese.
    const english = await translate({
      items: [
        { id: 1, text: "Okay.", language: "en" },
        { id: 2, text: "We waited two days to cross.", language: "en" },
      ],
      languageHint: "zh-CN",
    });
    assert.deepEqual(
      [...english.values()],
      ["[en>zh] Okay.", "[en>zh] We waited two days to cross."],
    );
    // Nothing says what they are in: refused, for the fallback engine.
    await assert.rejects(
      translate({ items: [{ id: 1, text: "Thank you." }], languageHint: "zh" }),
      unknownSource,
    );
  }));

test("built-in translator: a text declared in the target language is kept", () =>
  withoutDetector(async (translate) => {
    const results = await translate({
      items: [
        { id: 1, text: "好的。", language: "zh" },
        { id: 2, text: "Okay.", language: "en" },
      ],
      languageHint: "zh-CN",
    });
    assert.equal(results.get(1), "好的。");
    assert.equal(results.get(2), "[en>zh] Okay.");
  }));

test("built-in translator: a hint in another language is a source to translate from", () =>
  withoutDetector(async (translate) => {
    const results = await translate({
      items: [{ id: 1, text: "Bonjour." }],
      languageHint: "fr",
    });
    assert.equal(results.get(1), "[fr>zh] Bonjour.");
  }));

test("built-in translator: a page's declared language decides as before", () =>
  withoutDetector(async (translate) => {
    // A page in the target language keeps its text.
    const chinese = await translate({
      items: [{ id: 1, text: "好的。" }],
      pageLanguage: "zh",
    });
    assert.equal(chinese.get(1), "好的。");
    const english = await translate({
      items: [{ id: 1, text: "Okay." }],
      pageLanguage: "en",
    });
    assert.equal(english.get(1), "[en>zh] Okay.");
  }));

test("built-in translator: subtitles saved apart from the page's text", () => {
  const engine = browserEngine();
  assert.equal(engineCacheKey(engine), "browser");
  assert.notEqual(
    engineCacheKey(engine, PAGE_TRANSLATE_CONTENT.subtitles),
    "browser",
  );
});
