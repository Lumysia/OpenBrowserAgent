import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEngineChain,
  translateItems,
  type ActiveEngine,
} from "../src/background/page-translate/engine-chain";
import {
  EngineError,
  type EngineRequest,
  type TranslationEngine,
} from "../src/background/page-translate/engines/types";
import { browserEngine } from "../src/background/page-translate/engines/browser";
import {
  errorEvent,
  switchMessage,
} from "../src/background/page-translate/notes";
import { createPageSession } from "../src/background/page-translate/session";
import { getMessages } from "../src/shared/i18n";
import {
  PAGE_TRANSLATE_ERROR,
  type PageTranslateEvent,
} from "../src/shared/page-translate/protocol";
import {
  PAGE_TRANSLATE_ENGINES,
  PAGE_TRANSLATE_FALLBACK,
} from "../src/shared/page-translate/settings";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { installChrome } from "./fake-chrome";

const ITEMS = [
  { id: 1, text: "One" },
  { id: 2, text: "Two" },
];

let nextId = 0;

// An engine that fails with the given errors in turn, then translates.
function fakeEngine(name: string, failures: EngineError[] = []) {
  const calls: number[][] = [];
  const engine: TranslationEngine = {
    // A gate of its own per test.
    id: `${name}-${nextId++}`,
    cacheKey: name,
    limits: { concurrency: 4, maxItems: 10, maxChars: 1000, firstItems: 2 },
    async translate(request: EngineRequest) {
      calls.push(request.items.map((item) => item.id));
      const failure = failures.shift();
      if (failure) throw failure;
      for (const item of request.items)
        request.onItem(item.id, `${name}:${item.text}`);
    },
  };
  return { engine, calls };
}

const rateLimited = () =>
  new EngineError(PAGE_TRANSLATE_ERROR.rateLimited, "HTTP 429", 120_000);
const refused = () => new EngineError(PAGE_TRANSLATE_ERROR.refused, "403");
const network = () =>
  new EngineError(PAGE_TRANSLATE_ERROR.network, "Failed to fetch");

function freeChain(
  google: TranslationEngine,
  microsoft: TranslationEngine,
  options: { switched?: boolean } = {},
) {
  const switches: Array<{ from: string; to: string; kind: string }> = [];
  let resolved = 0;
  const chain = createEngineChain(
    { kind: "google", engine: google },
    {
      switched: options.switched,
      fallback: options.switched
        ? undefined
        : {
            kind: "microsoft",
            resolve: () => {
              resolved++;
              return microsoft;
            },
          },
      onSwitch: (from: ActiveEngine, to: ActiveEngine, error) =>
        switches.push({ from: from.kind, to: to.kind, kind: error.kind }),
    },
  );
  return { chain, switches, resolvedCount: () => resolved };
}

function run(chain: ReturnType<typeof freeChain>["chain"], items = ITEMS) {
  const results = new Map<number, string>();
  const producers = new Map<number, string>();
  return translateItems(chain, items, {
    target: "fr",
    signal: new AbortController().signal,
    onItem: (id, text, engine) => {
      results.set(id, text);
      producers.set(id, engine.cacheKey);
    },
  }).then(() => ({ results, producers }));
}

test("fallback: a rate-limited free service hands over to the other one", async () => {
  const google = fakeEngine("google", [rateLimited()]);
  const microsoft = fakeEngine("microsoft");
  const { chain, switches } = freeChain(google.engine, microsoft.engine);
  const { results, producers } = await run(chain);
  assert.deepEqual(switches, [
    { from: "google", to: "microsoft", kind: "rateLimited" },
  ]);
  assert.equal(results.get(1), "microsoft:One");
  // Saved under the engine that translated them.
  assert.equal(producers.get(2), "microsoft");
  assert.equal(chain.current.kind, "microsoft");
  // The rest of the session stays on the other service.
  await run(chain);
  assert.equal(google.calls.length, 1);
  assert.equal(microsoft.calls.length, 2);
});

test("fallback: batches failing at once switch once", async () => {
  const google = fakeEngine("google", [refused(), refused(), refused()]);
  const microsoft = fakeEngine("microsoft");
  const { chain, switches, resolvedCount } = freeChain(
    google.engine,
    microsoft.engine,
  );
  const outcomes = await Promise.all([run(chain), run(chain), run(chain)]);
  assert.equal(switches.length, 1);
  assert.equal(resolvedCount(), 1);
  for (const { results } of outcomes)
    assert.equal(results.get(1), "microsoft:One");
});

test("fallback: one network error retries, a second in a row switches", async () => {
  const flaky = fakeEngine("google", [network()]);
  const other = fakeEngine("microsoft");
  const first = freeChain(flaky.engine, other.engine);
  assert.equal((await run(first.chain)).results.get(1), "google:One");
  assert.equal(first.switches.length, 0);

  const down = fakeEngine("google", [network(), network()]);
  const second = freeChain(down.engine, other.engine);
  assert.equal((await run(second.chain)).results.get(1), "microsoft:One");
  assert.deepEqual(second.switches, [
    { from: "google", to: "microsoft", kind: "network" },
  ]);
});

test("fallback: both services failing stops with allFailed", async () => {
  const google = fakeEngine("google", [rateLimited()]);
  const microsoft = fakeEngine("microsoft", [refused()]);
  const { chain } = freeChain(google.engine, microsoft.engine);
  await assert.rejects(
    run(chain),
    (error) =>
      error instanceof EngineError &&
      error.kind === PAGE_TRANSLATE_ERROR.allFailed,
  );
  assert.equal(google.calls.length, 1);
  assert.equal(microsoft.calls.length, 1);
});

test("fallback: a session that already switched doesn't switch back", async () => {
  const microsoft = fakeEngine("microsoft", [rateLimited()]);
  const google = fakeEngine("google");
  const { chain, switches } = freeChain(microsoft.engine, google.engine, {
    switched: true,
  });
  await assert.rejects(
    run(chain),
    (error) =>
      error instanceof EngineError &&
      error.kind === PAGE_TRANSLATE_ERROR.allFailed,
  );
  assert.equal(switches.length, 0);
  assert.equal(google.calls.length, 0);
});

test("fallback: oversized requests split on the same engine", async () => {
  const google = fakeEngine("google", [
    new EngineError(PAGE_TRANSLATE_ERROR.failed, "413", undefined, true),
  ]);
  const microsoft = fakeEngine("microsoft");
  const { chain, switches } = freeChain(google.engine, microsoft.engine);
  const { results } = await run(chain);
  assert.equal(results.get(2), "google:Two");
  assert.deepEqual(google.calls, [[1, 2], [1], [2]]);
  assert.equal(switches.length, 0);
});

test("no fallback: the AI model reports its own errors", async () => {
  const model = fakeEngine("model", [rateLimited()]);
  const chain = createEngineChain({ kind: "model", engine: model.engine });
  await assert.rejects(
    run(chain),
    (error) =>
      error instanceof EngineError &&
      error.kind === PAGE_TRANSLATE_ERROR.rateLimited,
  );
  assert.equal(model.calls.length, 1);
});

test("fallback table: free services swap, the other engines translate alone", () => {
  assert.deepEqual(PAGE_TRANSLATE_FALLBACK, {
    google: "microsoft",
    microsoft: "google",
  });
  // Every engine named in a note has a name in every locale.
  for (const engine of PAGE_TRANSLATE_ENGINES)
    assert.ok(getMessages("en-US").pageTranslate.engineNames[engine]);
});

// The browser's Translator API as a test sets it up; none when `api` is
// undefined.
async function withTranslator<T>(
  api: Record<string, unknown> | undefined,
  run: () => Promise<T>,
) {
  const scope = globalThis as Record<string, unknown>;
  const detector = {
    availability: async () => "available",
    create: async () => ({
      detect: async () => [{ detectedLanguage: "en", confidence: 0.9 }],
    }),
  };
  if (api)
    Object.assign(scope, { Translator: api, LanguageDetector: detector });
  try {
    return await run();
  } finally {
    delete scope.Translator;
    delete scope.LanguageDetector;
  }
}

const translatorCases: Array<[string, Record<string, unknown> | undefined]> = [
  ["no Translator API in this browser", undefined],
  [
    "the language pair is unavailable",
    {
      availability: async () => "unavailable",
      create: async () => assert.fail("create() for an unavailable pair"),
    },
  ],
  [
    "the translator can't be created",
    {
      availability: async () => "downloadable",
      create: async () => {
        throw new DOMException("Download failed", "NetworkError");
      },
    },
  ],
];

for (const [name, api] of translatorCases)
  test(`built-in translator: ${name} fails as unavailable, with no other engine`, () =>
    withTranslator(api, async () => {
      const chain = createEngineChain({
        kind: "browser",
        engine: browserEngine(),
      });
      await assert.rejects(
        run(chain),
        (error) =>
          error instanceof EngineError &&
          error.kind === PAGE_TRANSLATE_ERROR.unavailable,
      );
      assert.equal(chain.current.kind, "browser");
    }));

test("notes: a switch names both engines in the UI language", () => {
  const unavailable = new EngineError(PAGE_TRANSLATE_ERROR.unavailable, "x");
  assert.equal(
    switchMessage("en-US", "google", "microsoft", unavailable),
    "Switched to Microsoft for this page: Google can't translate it here.",
  );
  assert.equal(
    switchMessage("zh-CN", "google", "microsoft", unavailable),
    "Google无法在此翻译这个页面，已改用 Microsoft。",
  );
  assert.equal(
    switchMessage("en-US", "google", "microsoft", rateLimited()),
    "Switched to Microsoft for this page: Google is limiting requests.",
  );
  const theme = { colorScheme: "system", accentColor: "pink" } as const;
  const event = errorEvent(
    new EngineError(PAGE_TRANSLATE_ERROR.allFailed, "x"),
    1,
    { language: "en-US", theme, kind: "microsoft", selected: "google" },
  );
  assert.equal(
    event.type === "error" && event.message,
    "Neither Google nor Microsoft could translate this page. Try again later or choose another engine in Settings.",
  );
});

test("session: the built-in translator without a Translator API says to choose another engine, without the AI model", () =>
  withTranslator(undefined, async () => {
    const { local } = installChrome({ runtime: { getManifest: () => ({}) } });
    await local.set({
      [STORAGE_KEYS.preferences]: { pageTranslate: { engine: "browser" } },
    });
    const events: PageTranslateEvent[] = [];
    let done!: () => void;
    const finished = new Promise<void>((resolve) => (done = resolve));
    const send = createPageSession((event) => {
      events.push(event);
      if (event.type === "done") done();
    }, new AbortController().signal);
    send({ type: "start", pageLanguage: "en" });
    send({ type: "translate", batch: 1, items: ITEMS });
    await finished;
    const session = events.find((event) => event.type === "session");
    assert.equal(
      session?.type === "session" && session.config.engine,
      "browser",
    );
    const error = events.find((event) => event.type === "error");
    assert.equal(
      error?.type === "error" && error.kind,
      PAGE_TRANSLATE_ERROR.unavailable,
    );
    // No AI model is set up: asking it would have said to set one up.
    assert.equal(
      error?.type === "error" && error.message,
      "Built-in translator (on device) can't translate this page. Choose another engine in Page translation settings.",
    );
    const zh = errorEvent(
      new EngineError(PAGE_TRANSLATE_ERROR.unavailable, "x"),
      1,
      {
        language: "zh-CN",
        theme: { colorScheme: "system", accentColor: "pink" },
        kind: "browser",
        selected: "browser",
      },
    );
    assert.equal(
      zh.type === "error" && zh.message,
      "内置翻译器（设备端）无法翻译此页面。请在“网页翻译”设置中选择其他翻译引擎。",
    );
    assert.ok(!events.some((event) => event.type === "switched"));
  }));
