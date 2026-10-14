import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatBytes,
  formatDateTime,
  formatNumber,
} from "../src/shared/format";
import { formatCount, getMessages } from "../src/shared/i18n";

// getMessages(language) makes `language` the one formatters use, as the
// side panel and options pages do when they read the stored language.
// ICU versions differ in which space they put between a number and its
// unit or time marker, so spaces are compared as plain ones.
function inLanguage(language: string, run: () => string) {
  getMessages(language);
  try {
    return run().replace(/\s/g, " ");
  } finally {
    getMessages("en-US");
  }
}

test("sizes use the decimal separator and units of the UI language", () => {
  const size = 2.2 * 1024;
  assert.equal(
    inLanguage("en-US", () => formatBytes(size)),
    "2.2 kB",
  );
  assert.equal(
    inLanguage("de-DE", () => formatBytes(size)),
    "2,2 kB",
  );
  assert.equal(
    inLanguage("zh-CN", () => formatBytes(size)),
    "2.2 kB",
  );
  assert.equal(
    inLanguage("ja-JP", () => formatBytes(size)),
    "2.2 KB",
  );
  assert.equal(
    inLanguage("de-DE", () => formatBytes(3.5 * 1024 * 1024)),
    "3,5 MB",
  );
  assert.equal(
    inLanguage("de-DE", () => formatBytes(3.5 * 1024 * 1024, "kb")),
    "3.584,0 kB",
  );
  assert.equal(
    inLanguage("en-US", () => formatBytes(512)),
    "512 bytes",
  );
});

test("numbers follow the UI language, not the browser's", () => {
  assert.equal(
    inLanguage("de-DE", () => formatNumber(1234.5)),
    "1.234,5",
  );
  assert.equal(
    inLanguage("en-US", () => formatNumber(1234.5)),
    "1,234.5",
  );
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
    inLanguage("en-US", () => formatDateTime(value, options)),
    "Oct 14, 3:30 PM",
  );
  assert.equal(
    inLanguage("de-DE", () => formatDateTime(value, options)),
    "14. Okt., 15:30",
  );
  assert.equal(
    inLanguage("zh-CN", () => formatDateTime(value, options)),
    "10月14日 15:30",
  );
  assert.equal(
    inLanguage("ja-JP", () => formatDateTime(value, options)),
    "10月14日 15:30",
  );
});

test("counts pick the plural form and measure word of the UI language", () => {
  const models = (language: string, count: number) =>
    inLanguage(language, () =>
      formatCount(getMessages(language).display.counts.models, count),
    );
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
    inLanguage("de-DE", () =>
      formatCount(getMessages("de-DE").display.counts.characters, 12345),
    ),
    "12.345 Zeichen",
  );
  assert.equal(
    inLanguage("en-US", () =>
      formatCount(getMessages("en-US").display.toolSteps.editsApplied, 3, {
        applied: 2,
      }),
    ),
    "2 of 3 edits applied",
  );
});
