import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cue } from "../src/shared/video-subtitles/cues";
import {
  lineAt,
  linesInWindow,
  SUBTITLE_WINDOW,
} from "../src/shared/video-subtitles/schedule";
import {
  SEGMENT_LIMITS,
  segmentCues,
} from "../src/shared/video-subtitles/segment";

const cue = (start: number, end: number, text: string): Cue => ({
  start,
  end,
  text,
});

test("human cues: a sentence over two close cues becomes one line", () => {
  const lines = segmentCues([
    cue(1, 2, "We went to the"),
    cue(2.1, 3, "market yesterday."),
    cue(3.1, 4, "It rained."),
    cue(6, 7, "Later"),
  ]);
  assert.deepEqual(lines, [
    { start: 1, end: 3, text: "We went to the market yesterday." },
    { start: 3.1, end: 4, text: "It rained." },
    { start: 6, end: 7, text: "Later" },
  ]);
});

test("rolling cues don't repeat the line carried over", () => {
  const lines = segmentCues([
    cue(0, 2, "first part"),
    cue(2, 4, "first part\nsecond part."),
  ]);
  assert.deepEqual(
    lines.map((line) => line.text),
    ["first part second part."],
  );
});

test("timed words: pauses and the word cap end a line; spacing is kept", () => {
  const words = (start: number, list: string[], step = 0.3) =>
    list.map((text, index) => ({ start: start + index * step, text }));
  const lines = segmentCues([
    {
      start: 0,
      end: 10,
      text: "so this is it then",
      words: words(0, ["so", " this", " is"]),
    },
    // A pause of more than SEGMENT_LIMITS.pauseSeconds after "is".
    { start: 3, end: 10, text: "it then", words: words(3, ["it", " then"]) },
  ]);
  assert.deepEqual(
    lines.map((line) => line.text),
    ["so this is", "it then"],
  );
  // The first line ends where the next begins.
  assert.ok(lines[0]!.end <= lines[1]!.start);

  const many = Array.from({ length: SEGMENT_LIMITS.maxWords + 5 }, (_, i) => ({
    start: i * 0.2,
    text: ` w${i}`,
  }));
  const capped = segmentCues([
    { start: 0, end: 20, text: "", words: [{ start: 0, text: "w" }, ...many] },
  ]);
  assert.equal(capped.length, 2);
  assert.ok(capped[0]!.text.split(" ").length <= SEGMENT_LIMITS.maxWords);
});

test("the line on screen, and the lines to translate around the playhead", () => {
  const lines = Array.from({ length: 400 }, (_, i) => ({
    start: i,
    end: i + 0.9,
    text: `line ${i}`,
  }));
  assert.equal(lineAt(lines, 10.5)?.text, "line 10");
  assert.equal(lineAt(lines, 10.95), undefined);
  const window = linesInWindow(lines, 100.5);
  assert.equal(window[0]!.text, `line ${100 - SUBTITLE_WINDOW.behindSeconds}`);
  assert.equal(
    window.at(-1)!.start,
    Math.floor(100.5 + SUBTITLE_WINDOW.aheadSeconds),
  );
  // A seek moves the window.
  assert.equal(linesInWindow(lines, 300)[0]!.text, "line 298");
});
