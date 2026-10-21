import assert from "node:assert/strict";
import { before, test } from "node:test";
import ng from "@jitl/quickjs-ng-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import { runJavaScript } from "../src/shared/code-sandbox/engine";
import { CODE_LANGUAGE } from "../src/shared/code-sandbox/protocol";
import { CODE_RUN_LIMITS } from "../src/shared/config";

// QuickJS has no Intl: the guest's comes from the host, so it formats,
// converts time zones and compares as the browser does.
let quickjs: QuickJSWASMModule;
before(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(ng);
});

function run(code: string) {
  const result = runJavaScript(quickjs, {
    id: "run",
    language: CODE_LANGUAGE.javascript,
    code,
    files: {},
    timeoutMs: CODE_RUN_LIMITS.defaultTimeoutMs,
  });
  return {
    ...result,
    parsed: result.value === undefined ? undefined : JSON.parse(result.value),
  };
}

const MOMENT = Date.UTC(2026, 9, 21, 23, 44);

test("time zone formatting works as in the browser (the call that failed)", () => {
  const options = {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  } as const;
  const result = run(
    `const d = new Date(${MOMENT} + 60000);
     new Intl.DateTimeFormat('sv-SE', ${JSON.stringify(options)}).format(d)`,
  );
  assert.equal(result.error, undefined);
  assert.equal(
    result.parsed,
    new Intl.DateTimeFormat("sv-SE", options).format(MOMENT + 60_000),
  );
  assert.equal(result.parsed, "2026-10-21 19:45");
});

test("Intl's constructors, getters, statics and errors follow the host's", () => {
  const { parsed, error } = run(`({
    parts: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric' }).formatToParts(new Date(0)),
    bound: [new Date(0)].map(new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).format),
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    number: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5),
    sorted: ['b', 'ä', 'a'].sort(new Intl.Collator('de').compare),
    plural: new Intl.PluralRules('ar').select(2),
    relative: new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }).format(-1, 'day'),
    locale: new Intl.Locale('en').maximize().toString(),
    region: new Intl.Locale('zh-Hant-TW').region,
    words: [...new Intl.Segmenter('en', { granularity: 'word' }).segment('Hi there, you')]
      .filter((s) => s.isWordLike).map((s) => s.segment + ':' + s.input.length),
    zones: Intl.supportedValuesOf('timeZone').includes('Europe/Paris'),
    canonical: Intl.getCanonicalLocales('EN-us'),
    supported: Intl.NumberFormat.supportedLocalesOf(['fr']),
    tag: Object.prototype.toString.call(new Intl.NumberFormat()),
    noNew: Intl.NumberFormat('en').format(1e6),
    badZone: (() => { try { new Intl.DateTimeFormat('en', { timeZone: 'Mars/Base' }); } catch (e) { return e instanceof RangeError; } })(),
    foreign: (() => { try { Intl.Collator.prototype.compare; } catch (e) { return e instanceof TypeError; } })(),
  })`);
  assert.equal(error, undefined);
  assert.deepEqual(
    parsed.parts,
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
    }).formatToParts(new Date(0)),
  );
  assert.deepEqual(parsed.bound, ["01/01/1970"]);
  assert.equal(parsed.zone, Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(
    parsed.number,
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(1234.5),
  );
  assert.deepEqual(parsed.sorted, ["a", "ä", "b"]);
  assert.equal(parsed.plural, "two");
  assert.equal(parsed.relative, "hier");
  assert.equal(parsed.locale, "en-Latn-US");
  assert.equal(parsed.region, "TW");
  assert.deepEqual(parsed.words, ["Hi:13", "there:13", "you:13"]);
  assert.equal(parsed.zones, true);
  assert.deepEqual(parsed.canonical, ["en-US"]);
  assert.deepEqual(parsed.supported, ["fr"]);
  assert.equal(parsed.tag, "[object Intl.NumberFormat]");
  assert.equal(parsed.noNew, "1,000,000");
  assert.equal(parsed.badZone, true);
  assert.equal(parsed.foreign, true);
});

test("locale methods of built-ins take locales and options", () => {
  const { parsed, error } = run(`[
    new Date(0).toLocaleString('en-GB', { timeZone: 'UTC' }),
    new Date(0).toLocaleDateString('de-DE', { timeZone: 'UTC', weekday: 'long' }),
    new Date(NaN).toLocaleString(),
    (1234567.891).toLocaleString('de-DE'),
    NaN.toLocaleString('en'),
    (-0).toLocaleString('en'),
    12345678901234567890n.toLocaleString('en'),
    'a'.localeCompare('B', 'en', { sensitivity: 'base' }),
    'i'.toLocaleUpperCase('tr'),
  ]`);
  assert.equal(error, undefined);
  assert.deepEqual(parsed, [
    new Date(0).toLocaleString("en-GB", { timeZone: "UTC" }),
    "Donnerstag",
    "Invalid Date",
    "1.234.567,891",
    "NaN",
    "-0",
    "12,345,678,901,234,567,890",
    -1,
    "İ",
  ]);
});

test("Date reads the host's local time zone", () => {
  const { parsed } = run(
    `[new Date(${MOMENT}).getTimezoneOffset(), new Date(2026, 0, 15, 9).getTime()]`,
  );
  assert.deepEqual(parsed, [
    new Date(MOMENT).getTimezoneOffset(),
    new Date(2026, 0, 15, 9).getTime(),
  ]);
});
