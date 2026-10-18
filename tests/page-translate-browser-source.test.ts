import assert from "node:assert/strict";
import { test } from "node:test";
import { browserEngine } from "../src/background/page-translate/engines/browser";
import {
  EngineError,
  engineCacheKey,
  type EngineRequest,
} from "../src/background/page-translate/engines/types";
import { createPageSession } from "../src/background/page-translate/session";
import {
  PAGE_TRANSLATE_CONTENT,
  PAGE_TRANSLATE_ERROR,
  type PageTranslateEvent,
} from "../src/shared/page-translate/protocol";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { installChrome } from "./fake-chrome";

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
    // Nothing says what they are in: refused, and the page says the
    // built-in translator can't translate it.
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

// Like a detector given too little text: no answer under 60 characters.
async function withShortSighted(run: () => Promise<void>) {
  const scope = globalThis as Record<string, unknown>;
  scope.LanguageDetector = {
    availability: async () => "available",
    create: async () => ({
      detect: async (text: string) =>
        text.length < 60 ? [] : [{ detectedLanguage: "en", confidence: 0.9 }],
    }),
  };
  try {
    await run();
  } finally {
    delete scope.LanguageDetector;
  }
}

const SHORT_LINES = [
  { id: 1, text: "Okay." },
  { id: 2, text: "Thank you." },
];

test("built-in translator: short lines take their language from the text before them", () =>
  withShortSighted(() =>
    withoutDetector(async (translate) => {
      const subtitles = PAGE_TRANSLATE_CONTENT.subtitles;
      await assert.rejects(
        translate({ items: SHORT_LINES, content: subtitles }),
        unknownSource,
      );
      const results = await translate({
        items: SHORT_LINES,
        content: subtitles,
        sample:
          "The river was high that spring. We waited two days to cross it.",
      });
      assert.deepEqual(
        [...results.values()],
        ["[en>zh] Okay.", "[en>zh] Thank you."],
      );
    }),
  ));

test("subtitle session: later short lines are told by the lines asked for before", () =>
  withShortSighted(() =>
    withoutDetector(async () => {
      const { local } = installChrome({
        runtime: { getManifest: () => ({}) },
      });
      await local.set({
        [STORAGE_KEYS.preferences]: {
          pageTranslate: { engine: "browser", targetLanguage: "zh-CN" },
        },
      });
      const events: PageTranslateEvent[] = [];
      const finished = new Map<number, () => void>();
      const send = createPageSession((event) => {
        events.push(event);
        if (event.type === "done") finished.get(event.batch)?.();
      }, new AbortController().signal);
      const batch = (number: number, items: typeof SHORT_LINES) => {
        const done = new Promise<void>((resolve) =>
          finished.set(number, resolve),
        );
        send({ type: "translate", batch: number, items });
        return done;
      };
      send({
        type: "start",
        content: PAGE_TRANSLATE_CONTENT.subtitles,
        pageLanguage: "zh-CN",
      });
      await batch(1, [
        {
          id: 1,
          text: "The river was high that spring, and we waited two days to cross.",
        },
      ]);
      await batch(2, [
        { id: 2, text: "Okay." },
        { id: 3, text: "Thank you." },
      ]);
      assert.ok(!events.some((event) => event.type === "error"));
      assert.deepEqual(
        events.flatMap((event) =>
          event.type === "item" && event.batch === 2 ? [event.text] : [],
        ),
        ["[en>zh] Okay.", "[en>zh] Thank you."],
      );
    }),
  ));
