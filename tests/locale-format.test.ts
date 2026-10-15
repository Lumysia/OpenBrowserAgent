import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "../src/shared/format";
import { formatCount, getMessages, languageOf } from "../src/shared/i18n";
import { formatMessageTime } from "../entrypoints/sidepanel/format";

// ICU versions differ in which space they put between a number and its
// unit or time marker, so spaces are compared as plain ones.
function plain(text: string) {
  return text.replace(/\s/g, " ");
}

test("sizes use the decimal separator and units of the UI language", () => {
  const size = 2.2 * 1024;
  assert.equal(plain(formatBytes("en-US", size)), "2.2 kB");
  assert.equal(plain(formatBytes("de-DE", size)), "2,2 kB");
  assert.equal(plain(formatBytes("zh-CN", size)), "2.2 kB");
  assert.equal(plain(formatBytes("ja-JP", size)), "2.2 KB");
  assert.equal(plain(formatBytes("de-DE", 3.5 * 1024 * 1024)), "3,5 MB");
  assert.equal(
    plain(formatBytes("de-DE", 3.5 * 1024 * 1024, "kb")),
    "3.584,0 kB",
  );
  assert.equal(plain(formatBytes("en-US", 512)), "512 bytes");
});

test("numbers follow the UI language, not the browser's", () => {
  assert.equal(plain(formatNumber("de-DE", 1234.5)), "1.234,5");
  assert.equal(plain(formatNumber("en-US", 1234.5)), "1,234.5");
});

test("dates and times follow the UI language", () => {
  const value = Date.UTC(2026, 9, 14, 15, 30);
  const options = {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  } as const;
  assert.equal(
    plain(formatDateTime("en-US", value, options)),
    "Oct 14, 3:30 PM",
  );
  assert.equal(
    plain(formatDateTime("de-DE", value, options)),
    "14. Okt., 15:30",
  );
  assert.equal(
    plain(formatDateTime("zh-CN", value, options)),
    "10月14日 15:30",
  );
  assert.equal(
    plain(formatDateTime("ja-JP", value, options)),
    "10月14日 15:30",
  );
});

test("counts pick the plural form and measure word of the UI language", () => {
  const models = (language: string, count: number) =>
    plain(formatCount(getMessages(language).display.counts.models, count));
  assert.equal(models("en-US", 1), "1 model");
  assert.equal(models("en-US", 2), "2 models");
  assert.equal(models("de-DE", 1), "1 Modell");
  assert.equal(models("de-DE", 2), "2 Modelle");
  assert.equal(models("zh-CN", 2), "2 个模型");
  assert.equal(models("zh-TW", 2), "2 個模型");
  assert.equal(models("ja-JP", 2), "2個のモデル");
});

test("counts format the number and fill extra placeholders", () => {
  assert.equal(
    plain(formatCount(getMessages("de-DE").display.counts.characters, 12345)),
    "12.345 Zeichen",
  );
  assert.equal(
    plain(
      formatCount(getMessages("en-US").display.toolSteps.editsApplied, 3, {
        applied: 2,
      }),
    ),
    "2 of 3 edits applied",
  );
});

test("durations use the units of the UI language", () => {
  assert.equal(plain(formatDuration("en-US", 850)), "850 ms");
  assert.equal(plain(formatDuration("de-DE", 1250)), "1,25 Sek.");
  assert.equal(plain(formatDuration("zh-CN", 1250)), "1.25秒");
});

test("messages know their language, and reading them changes nothing", () => {
  const de = getMessages("de-DE");
  getMessages("ja-JP");
  assert.equal(languageOf(de), "de-DE");
  assert.equal(languageOf(getMessages("fr")), "fr-FR");
  assert.equal(languageOf(getMessages()), "en-US");
  assert.equal(plain(formatNumber(languageOf(de), 1234.5)), "1.234,5");
});

test("message timestamps follow the UI language", () => {
  const value = new Date(2026, 9, 14, 15, 30).getTime();
  assert.equal(plain(formatMessageTime("de-DE", value)), "14. Okt., 15:30");
  assert.equal(plain(formatMessageTime("en-US", value)), "Oct 14, 3:30 PM");
});
