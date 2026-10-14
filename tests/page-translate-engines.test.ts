import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  pauseEngine,
  withEngineSlot,
} from "../src/background/page-translate/engine-gate";
import {
  fromGoogleHtml,
  googleEngine,
  toGoogleHtml,
} from "../src/background/page-translate/engines/google";
import { browserEngine } from "../src/background/page-translate/engines/browser";
import { classifyFailure } from "../src/background/page-translate/engines/http";
import { microsoftEngine } from "../src/background/page-translate/engines/microsoft";
import {
  modelEngine,
  modelPrompt,
} from "../src/background/page-translate/engines/model";
import { EngineError } from "../src/background/page-translate/engines/types";
import { providerFixture } from "./provider-fixtures";

// Responses recorded from the live services on 2026-10-14 for the requests
// below (see tests/fixtures/page-translate/).
const fixture = (name: string) =>
  readFileSync(
    new URL(`./fixtures/page-translate/${name}`, import.meta.url),
    "utf8",
  );

const ITEMS = [
  {
    id: 7,
    text: "Read the <b1>field guide</b1> before you <b2>leave the trail</b2>, and run {3} first.",
  },
  { id: 8, text: "Bring enough water & food for the day." },
];

type Call = { url: string; init: RequestInit };

function mockFetch(
  respond: (
    call: Call,
  ) => { status?: number; type?: string; body: string } | Error,
) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init: RequestInit = {},
  ) => {
    const call = { url: String(input), init };
    calls.push(call);
    const result = respond(call);
    if (result instanceof Error) throw result;
    return new Response(result.body, {
      status: result.status ?? 200,
      headers: { "content-type": result.type ?? "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

async function run(engine: ReturnType<typeof googleEngine>, target = "fr") {
  const results: Record<number, string> = {};
  await engine.translate({
    items: ITEMS,
    target,
    signal: new AbortController().signal,
    onItem: (id, text) => (results[id] = text),
  });
  return results;
}

const FRENCH = {
  7: "Lisez le <b1>guide de terrain</b1> avant de <b2>quitter le sentier</b2> et exécutez d'abord {3}.",
  8: "Apportez suffisamment d'eau et de nourriture pour la journée.",
};

test("Google: translateHtml request and response", async () => {
  const fetch = mockFetch(() => ({
    body: fixture("google-translate-html.json"),
  }));
  try {
    assert.deepEqual(await run(googleEngine()), FRENCH);
    const [call] = fetch.calls;
    assert.equal(
      call.url,
      "https://translate-pa.googleapis.com/v1/translateHtml",
    );
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json+protobuf");
    assert.match(headers["X-Goog-API-Key"], /^AIza/);
    assert.deepEqual(JSON.parse(String(call.init.body)), [
      [
        [
          "Read the <a i=1>field guide</a> before you <a i=2>leave the trail</a>, and run <code i=3>{3}</code> first.",
          "Bring enough water &amp; food for the day.",
        ],
        "auto",
        "fr",
      ],
      "te_lib",
    ]);
    assert.equal(call.init.credentials, "omit");
  } finally {
    fetch.restore();
  }
});

test("Google: a rate limit on translateHtml tries the keyless endpoint", async () => {
  const fetch = mockFetch((call) =>
    call.url.includes("translateHtml")
      ? { status: 429, type: "text/html", body: "<html>Sorry…</html>" }
      : { body: fixture("google-translate-a-t.json") },
  );
  try {
    assert.deepEqual(await run(googleEngine()), {
      ...FRENCH,
      7: "Lisez le <b1>guide de terrain</b1> avant de <b2>quitter le sentier</b2> et exécutez {3} en premier.",
    });
    const [, fallback] = fetch.calls;
    const url = new URL(fallback.url);
    assert.equal(
      url.origin + url.pathname,
      "https://translate.googleapis.com/translate_a/t",
    );
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      client: "gtx",
      dt: "t",
      sl: "auto",
      tl: "fr",
      format: "html",
    });
    assert.deepEqual(
      new URLSearchParams(String(fallback.init.body)).getAll("q"),
      [
        "Read the <a i=1>field guide</a> before you <a i=2>leave the trail</a>, and run <code i=3>{3}</code> first.",
        "Bring enough water &amp; food for the day.",
      ],
    );
  } finally {
    fetch.restore();
  }
});

test("Google: a refused key switches to the keyless endpoint for a while", async () => {
  let failures = 0;
  const fetch = mockFetch((call) => {
    if (!call.url.includes("translateHtml"))
      return { body: fixture("google-translate-a-t-single.json") };
    failures++;
    return { status: 400, body: fixture("google-invalid-key.json") };
  });
  try {
    const engine = googleEngine();
    const translate = async () => {
      const results: string[] = [];
      await engine.translate({
        items: [{ id: 1, text: "Good morning" }],
        target: "fr",
        signal: new AbortController().signal,
        onItem: (_id, text) => results.push(text),
      });
      return results;
    };
    assert.deepEqual(await translate(), ["Bonjour"]);
    assert.deepEqual(await translate(), ["Bonjour"]);
    // The key was tried once; the next request went straight to the fallback.
    assert.equal(failures, 1);
    assert.equal(fetch.calls.length, 3);
  } finally {
    fetch.restore();
  }
});

test("Google: both endpoints rate-limited is reported as such", async () => {
  const fetch = mockFetch(() => ({
    status: 429,
    type: "text/html",
    body: "<html>Sorry</html>",
  }));
  try {
    await assert.rejects(run(googleEngine()), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "rateLimited");
      return true;
    });
  } finally {
    fetch.restore();
  }
});

test("Google HTML: markers in, markers out", () => {
  assert.equal(
    toGoogleHtml("A <b1>x & y</b1> < {2}"),
    "A <a i=1>x &amp; y</a> &lt; <code i=2>{2}</code>",
  );
  // Google's space before punctuation after a tag, entities, and the
  // original sentences some clients add in <i>.
  assert.equal(
    fromGoogleHtml(
      "Bonjour <a i=0>le monde</a> . C&#39;est <b><i>It is</i>moi</b> &amp; toi <code i=1>[1]</code> .",
    ),
    "Bonjour <b0>le monde</b0>. C'est moi & toi {1}.",
  );
});

test("Microsoft: request and response", async () => {
  const fetch = mockFetch(() => ({
    type: "text/plain; charset=utf-8",
    body: fixture("microsoft-translatetext.json"),
  }));
  try {
    const results = await run(microsoftEngine(), "zh-CN");
    assert.deepEqual(results, {
      7: "Lisez le <b1>guide de terrain</b1> avant <b2>de quitter le sentier</b2>, et courez {3} d’abord.",
      8: "Apportez assez d’eau et de nourriture pour la journée. 3 < 4",
    });
    const [call] = fetch.calls;
    const url = new URL(call.url);
    assert.equal(
      url.origin + url.pathname,
      "https://edge.microsoft.com/translate/translatetext",
    );
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      from: "",
      to: "zh-Hans",
      isEnterpriseClient: "false",
    });
    assert.deepEqual(JSON.parse(String(call.init.body)), [
      "Read the <b1>field guide</b1> before you <b2>leave the trail</b2>, and run {3} first.",
      "Bring enough water &amp; food for the day.",
    ]);
  } finally {
    fetch.restore();
  }
});

test("failures: rate limits, refusals, oversize requests, network", async () => {
  const kind = (status: number, body = "", type = "application/json") => {
    const error = classifyFailure(
      "Service",
      { status, headers: new Headers({ "content-type": type }) },
      body,
    );
    return error && [error.kind, error.tooLarge];
  };
  assert.deepEqual(kind(429), ["rateLimited", false]);
  assert.deepEqual(kind(503), ["rateLimited", false]);
  // Google's "unusual traffic" page instead of JSON.
  assert.deepEqual(
    kind(200, "<!DOCTYPE html><title>Sorry...</title>", "text/html"),
    ["rateLimited", false],
  );
  assert.deepEqual(kind(403), ["refused", false]);
  assert.deepEqual(kind(400, fixture("google-invalid-key.json")), [
    "refused",
    false,
  ]);
  assert.deepEqual(
    kind(400, "Request exceeds the maximum allowed translation size."),
    ["failed", true],
  );
  assert.deepEqual(kind(500), ["failed", false]);
  assert.equal(kind(200, "[]"), undefined);
  const retry = classifyFailure(
    "Service",
    { status: 429, headers: new Headers({ "retry-after": "7" }) },
    "",
  );
  assert.equal(retry?.retryAfterMs, 7000);

  const fetch = mockFetch(() => new TypeError("Failed to fetch"));
  try {
    await assert.rejects(run(microsoftEngine()), (error: unknown) => {
      assert.ok(error instanceof EngineError);
      assert.equal(error.kind, "network");
      return true;
    });
  } finally {
    fetch.restore();
  }
});

test("engine gate: concurrency limit and a pause after a rate limit", async () => {
  const signal = new AbortController().signal;
  let running = 0;
  let most = 0;
  const work = () =>
    withEngineSlot("gate-test", 2, signal, async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running--;
    });
  await Promise.all([work(), work(), work(), work(), work()]);
  assert.equal(most, 2);
  assert.equal(pauseEngine("gate-pause", 50), 50);
  const started = Date.now();
  await withEngineSlot("gate-pause", 1, signal, async () => undefined);
  assert.ok(Date.now() - started >= 40);
  // Without Retry-After the pause doubles from 2 s.
  assert.equal(pauseEngine("gate-backoff"), 2000);
  assert.equal(pauseEngine("gate-backoff"), 4000);
});

test("AI model: items render as they stream, matched by number", async () => {
  const chunks = [
    "[[2]]\nDeux",
    " paragraphes\n[[1]]\n",
    "Un <b1>lien</b1>\n[[9]]\nInconnu\n",
    "[[end]]",
  ];
  const server = await providerFixture(
    async (_request: unknown, response: any) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const content of chunks) {
        response.write(
          `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      response.write(
        `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    },
  );
  try {
    const engine = modelEngine({
      provider: "openai",
      apiKey: "key",
      baseUrl: `${server.baseUrl}/v1`,
      modelName: "fixture",
    });
    const events: string[] = [];
    await engine.translate({
      items: [
        { id: 1, text: "A <b1>link</b1>" },
        { id: 2, text: "Two paragraphs" },
      ],
      target: "fr",
      pageTitle: "Notes",
      signal: new AbortController().signal,
      onItem: (id, text) => events.push(`item ${id}: ${text}`),
      onPartial: (id, text) => events.push(`partial ${id}: ${text}`),
    });
    assert.deepEqual(
      events.filter((event) => event.startsWith("item")),
      ["item 2: Deux paragraphes", "item 1: Un <b1>lien</b1>"],
    );
    assert.ok(events.includes("partial 2: Deux"));
    const body = server.requests[0].body as {
      messages: Array<{ role: string; content: string }>;
    };
    const user = body.messages.find((message) => message.role === "user");
    assert.equal(
      user?.content,
      "Page title: Notes\n\n[[1]]\nA <b1>link</b1>\n[[2]]\nTwo paragraphs\n[[end]]",
    );
    assert.match(engine.cacheKey, /^model:\d+:openai\|/);
  } finally {
    await server.close();
  }
});

test("AI model prompt: stable per language, names the target language", () => {
  const prompt = (target: string) =>
    modelPrompt({ items: [{ id: 1, text: "x" }], target }).system;
  assert.equal(prompt("ja"), prompt("ja"));
  assert.match(prompt("ja"), /into Japanese\./);
  assert.match(prompt("zh-TW"), /into Chinese \(Taiwan\)\./);
  assert.match(prompt("ja"), /\[\[end\]\]/);
});

test("built-in translator: detects the source, one translator per pair", async () => {
  const created: string[] = [];
  const scope = globalThis as Record<string, unknown>;
  scope.LanguageDetector = {
    availability: async () => "available",
    create: async () => ({
      detect: async (text: string) => [
        {
          detectedLanguage: /Bonjour/.test(text) ? "fr" : "en",
          confidence: 0.9,
        },
      ],
    }),
  };
  scope.Translator = {
    availability: async ({ targetLanguage }: { targetLanguage: string }) =>
      targetLanguage === "zh-Hant" ? "available" : "downloadable",
    create: async ({
      sourceLanguage,
      targetLanguage,
    }: {
      sourceLanguage: string;
      targetLanguage: string;
    }) => {
      created.push(`${sourceLanguage}>${targetLanguage}`);
      return {
        translate: async (text: string) => `[${targetLanguage}] ${text}`,
      };
    },
  };
  try {
    const engine = browserEngine();
    const translate = async (
      items: Array<{ id: number; text: string }>,
      target: string,
    ) => {
      const results: string[] = [];
      await engine.translate({
        items,
        target,
        signal: new AbortController().signal,
        onItem: (_id, text) => results.push(text),
      });
      return results;
    };
    assert.deepEqual(
      await translate([{ id: 1, text: "Hello <b1>world</b1>" }], "zh-TW"),
      ["[zh-Hant] Hello <b1>world</b1>"],
    );
    assert.deepEqual(
      await translate([{ id: 2, text: "Good night" }], "zh-TW"),
      ["[zh-Hant] Good night"],
    );
    // Already in the target language: returned as it is.
    assert.deepEqual(await translate([{ id: 3, text: "Bonjour" }], "fr"), [
      "Bonjour",
    ]);
    assert.deepEqual(created, ["en>zh-Hant"]);
  } finally {
    delete scope.Translator;
    delete scope.LanguageDetector;
  }
});

test("built-in translator: a text it refuses doesn't take the batch's others with it", async () => {
  const scope = globalThis as Record<string, unknown>;
  // Refuses texts by its own rules: filtered output, then an unknown error.
  let refuse = (text: string): DOMException | undefined =>
    text === "Second"
      ? new DOMException("filtered", "NotReadableError")
      : undefined;
  scope.Translator = {
    availability: async () => "available",
    create: async () => ({
      translate: async (text: string) => {
        const error = refuse(text);
        if (error) throw error;
        return `[fr] ${text}`;
      },
    }),
  };
  try {
    const engine = browserEngine();
    const translate = async (texts: string[]) => {
      const results: Array<[number, string]> = [];
      await engine.translate({
        items: texts.map((text, index) => ({ id: index + 1, text })),
        target: "fr",
        pageLanguage: "en",
        signal: new AbortController().signal,
        onItem: (id, text) => results.push([id, text]),
      });
      return results;
    };
    assert.deepEqual(await translate(["First", "Second", "Third", "Fourth"]), [
      [1, "[fr] First"],
      [3, "[fr] Third"],
      [4, "[fr] Fourth"],
    ]);
    // Nothing translated: the batch fails with the translator's error.
    refuse = () => new DOMException("unknown", "UnknownError");
    await assert.rejects(translate(["First", "Second"]), {
      name: "UnknownError",
    });
    // A translator that is turned off fails the batch at once.
    refuse = (text) =>
      text === "Second"
        ? new DOMException("disabled", "NotAllowedError")
        : undefined;
    await assert.rejects(translate(["First", "Second", "Third"]), {
      name: "NotAllowedError",
    });
  } finally {
    delete scope.Translator;
  }
});
