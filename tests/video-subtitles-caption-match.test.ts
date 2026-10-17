import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTION_MATCH,
  cueKeyAround,
  isCaptionOf,
} from "../src/shared/video-subtitles/caption-match";
import { plainCueText, type Cue } from "../src/shared/video-subtitles/cues";

const cues: Cue[] = [
  { start: 0, end: 4, text: "We packed the tent at dawn" },
  { start: 4, end: 8, text: "and walked to the lake &amp; back." },
  { start: 8, end: 12, text: "Nobody said a word." },
  { start: 60, end: 64, text: "Much later, the rain came." },
].map((cue) => ({ ...cue, text: plainCueText(cue.text) }));

test("player captions match the cues around the playhead", () => {
  const key = cueKeyAround(cues, 5);
  // A growing part of the line, wrapped and spaced the player's way.
  assert.ok(isCaptionOf("and walked\nto the", key));
  // The end of one line and the start of the next.
  assert.ok(isCaptionOf("tent at dawn\nand walked", key));
  // Entities decoded on both sides, case and punctuation ignored.
  assert.ok(isCaptionOf("The Lake & Back", key));
  // The line a little ahead.
  assert.ok(isCaptionOf("Nobody said", key));
});

test("short or other text over the video doesn't match", () => {
  const key = cueKeyAround(cues, 5);
  // One short word is in the cues, but too short to tell.
  assert.ok(!isCaptionOf("the lake", key));
  assert.ok(!isCaptionOf("Settings", key));
  assert.ok(!isCaptionOf("Chapter two: crossing the river", key));
  // A line said long after isn't on screen now.
  assert.ok(!isCaptionOf("Much later, the rain", key));
  assert.ok(isCaptionOf("Much later, the rain", cueKeyAround(cues, 61)));
  // Nor one said long before.
  const later = cueKeyAround(cues, 12 + CAPTION_MATCH.behindSeconds + 1);
  assert.ok(!isCaptionOf("Nobody said a word", later));
});
