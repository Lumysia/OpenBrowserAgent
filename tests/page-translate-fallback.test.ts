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
import { PAGE_TRANSLATE_ERROR } from "../src/shared/page-translate/protocol";

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

test("no fallback: engines other than the free services report as before", async () => {
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
