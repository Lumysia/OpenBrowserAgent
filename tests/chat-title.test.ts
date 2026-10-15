import assert from "node:assert/strict";
import { test } from "node:test";
import { compactTitle } from "../src/background/chat-title";
import {
  GENERATED_TITLE_MAX_CJK_CHARS,
  GENERATED_TITLE_MAX_WORDS,
} from "../src/shared/config";

test("compactTitle strips wrappers and trailing punctuation", () => {
  assert.equal(compactTitle('"Plan a trip."\n'), "Plan a trip");
  assert.equal(compactTitle("  \n "), "");
});

test("compactTitle limits words, or characters for unspaced scripts", () => {
  const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
  assert.equal(
    compactTitle(words).split(" ").length,
    GENERATED_TITLE_MAX_WORDS,
  );
  assert.equal(
    compactTitle("今天 天气怎么样我们一起去公园散步吧").length,
    GENERATED_TITLE_MAX_CJK_CHARS,
  );
});
