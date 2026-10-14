import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCount, getMessages } from "../src/shared/i18n";

test("counts use the plural form of the active language", () => {
  const cases: [string, number, string][] = [
    ["en-US", 1, "1 message"],
    ["en-US", 2, "2 messages"],
    ["en-US", 0, "0 messages"],
    ["de-DE", 1, "1 Nachricht"],
    ["fr-FR", 0, "0 message"],
    ["fr-FR", 3, "3 messages"],
    ["es-ES", 1, "1 mensaje"],
    ["pt-BR", 1, "1 mensagem"],
    ["ja-JP", 1, "1件のメッセージ"],
    ["zh-TW", 1, "1 則訊息"],
  ];
  for (const [language, count, expected] of cases)
    assert.equal(
      formatCount(getMessages(language).sidepanel.messageCount, count),
      expected,
    );
});
