import assert from "node:assert/strict";
import { test } from "node:test";
import { matchLines } from "../src/page/search";

const lines = [
  "text [e1]: TEST_TOKEN TEST_TOKEN",
  "text [e2]: nothing here",
  "button [e3]: test_token",
];

test("find counts matching lines and every occurrence in them", () => {
  const plain = matchLines(lines.slice(0, 2), "TEST_TOKEN", 30);
  assert.equal(plain.matchingLines, 1);
  assert.equal(plain.occurrences, 2);
  assert.deepEqual(plain.matches, ["text [e1]: TEST_TOKEN TEST_TOKEN"]);

  const insensitive = matchLines(lines, "test_token", 30);
  assert.deepEqual(
    [insensitive.matchingLines, insensitive.occurrences],
    [2, 3],
  );
});

test("find counts regex hits without overlaps, with or without g", () => {
  for (const query of ["/TEST_TOKEN/", "/TEST_TOKEN/g"]) {
    const result = matchLines(lines.slice(0, 1), query, 30);
    assert.deepEqual([result.matchingLines, result.occurrences], [1, 2], query);
  }
  const overlapping = matchLines(["aaaa"], "/aa/", 30);
  assert.equal(overlapping.occurrences, 2);
  const plainOverlap = matchLines(["aaaa"], "aa", 30);
  assert.equal(plainOverlap.occurrences, 2);
});

test("find returns at most `limit` lines but counts them all", () => {
  const result = matchLines(lines, "/token/i", 1);
  assert.equal(result.matches.length, 1);
  assert.deepEqual([result.matchingLines, result.occurrences], [2, 3]);
});
