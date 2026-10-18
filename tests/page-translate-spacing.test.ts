import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRANSLATION_GAP,
  TRANSLATION_SPACE_AFTER,
} from "../src/page-translate/render";
import { spaceStyle } from "../src/page-translate/spacing";

test("space after a block translation: at least the minimum, never added to the page's", () => {
  // The page keeps no space: the minimum sets the pair apart.
  assert.equal(
    spaceStyle(0, true),
    `margin-block-end: ${TRANSLATION_SPACE_AFTER}`,
  );
  // The page's space under the source moves under the translation; the
  // larger of the two stays.
  assert.equal(
    spaceStyle(24, true),
    `margin-block-start: calc(${TRANSLATION_GAP} - 24px); margin-block-end: max(24px, ${TRANSLATION_SPACE_AFTER})`,
  );
  // Where the space wouldn't join the page's margins, only the page's own
  // space moves.
  assert.equal(
    spaceStyle(6, false),
    `margin-block-start: calc(${TRANSLATION_GAP} - 6px); margin-block-end: 6px`,
  );
  assert.equal(spaceStyle(0, false), "");
});
