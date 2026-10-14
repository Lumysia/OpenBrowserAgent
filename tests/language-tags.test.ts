import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCount, getMessages } from "../src/shared/i18n";
import { languageName } from "../src/shared/language-name";
import {
  matchLanguageTag,
  normalizeLanguageTag,
  sameLanguage,
} from "../src/shared/language-tags";
import { matchTargetLanguage } from "../src/shared/page-translate/settings";
import { resolveLanguage } from "../src/shared/ui-languages";

test("the UI language serves any tag the browser reports", () => {
  const cases: Record<string, string> = {
    "en-US": "en-US",
    en: "en-US",
    "en-GB": "en-US",
    fr: "fr-FR",
    "fr-CA": "fr-FR",
    de: "de-DE",
    "de-AT": "de-DE",
    ja: "ja-JP",
    ko: "ko",
    "ko-KR": "ko",
    es: "es-ES",
    "es-419": "es-ES",
    pt: "pt-BR",
    "pt-BR": "pt-BR",
    zh: "zh-CN",
    "zh-CN": "zh-CN",
    zh_CN: "zh-CN",
    "zh-cn": "zh-CN",
    "zh-SG": "zh-CN",
    "zh-Hans": "zh-CN",
    "zh-TW": "zh-TW",
    "zh-HK": "zh-TW",
    "zh-MO": "zh-TW",
    "zh-Hant": "zh-TW",
    "zh-Hant-HK": "zh-TW",
  };
  for (const [tag, expected] of Object.entries(cases))
    assert.equal(resolveLanguage(tag), expected, tag);
});

test("a tag the UI has no language for, or no tag, falls back to English", () => {
  for (const tag of ["it", "ru-RU", "", undefined, "not a tag!"])
    assert.equal(resolveLanguage(tag), "en-US", String(tag));
});

test("matching prefers the same script, then the same region", () => {
  const supported = ["sr-Cyrl", "sr-Latn", "pt-BR", "pt-PT"];
  assert.equal(matchLanguageTag("sr-Latn-RS", supported), "sr-Latn");
  assert.equal(matchLanguageTag("sr", supported), "sr-Cyrl");
  assert.equal(matchLanguageTag("pt", supported), "pt-BR");
  assert.equal(matchLanguageTag("ja", supported), undefined);
});

test("tags are canonicalized once, the same way everywhere", () => {
  assert.equal(normalizeLanguageTag("en_us"), "en-US");
  assert.equal(normalizeLanguageTag("zh_hant_tw"), "zh-Hant-TW");
  assert.equal(normalizeLanguageTag("iw"), "he");
  assert.equal(normalizeLanguageTag("  "), undefined);
  assert.equal(languageName("zh_TW"), "Chinese (Taiwan)");
  assert.equal(languageName("fr", { inLanguage: "de" }), "Französisch");
  assert.equal(languageName("!", { fallback: "?" }), "?");
});

test("page translation targets follow the same matching", () => {
  assert.equal(matchTargetLanguage("fr-CA"), "fr");
  assert.equal(matchTargetLanguage("zh-HK"), "zh-TW");
  assert.equal(matchTargetLanguage("zh-Hans"), "zh-CN");
  assert.equal(matchTargetLanguage("pt"), "pt-BR");
  assert.equal(matchTargetLanguage("pt-PT"), "pt-PT");
  assert.equal(matchTargetLanguage("iw"), "he");
  assert.equal(matchTargetLanguage("ko-KR"), "ko");
  assert.equal(matchTargetLanguage("xx"), undefined);
  assert.ok(sameLanguage("iw", "he"));
  assert.ok(sameLanguage("no", "nb"));
  assert.ok(!sameLanguage("sr-Latn", "sr"));
});

test("a count is formatted in its message's language, whatever was loaded last", () => {
  const german = getMessages("de-DE").display.counts.characters;
  getMessages("en-US");
  assert.match(formatCount(german, 12345), /12\.345/);
});
