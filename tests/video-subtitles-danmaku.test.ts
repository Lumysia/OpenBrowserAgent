import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countLines,
  DANMAKU,
  isStream,
  movedSideways,
  movesSideways,
  type Box,
} from "../src/video-subtitles/sources/danmaku";

const box = (left: number, top: number, width: number, height = 20): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const FRAME_WIDTH = 640;

test("a caption box is at most a few lines; comments over the video are many", () => {
  // One line drawn as several pieces (words in their own spans, a
  // highlighted word), and a second line under it.
  const caption = [
    box(200, 300, 60),
    box(264, 300, 40),
    box(306, 301, 80),
    box(240, 322, 160),
  ];
  assert.equal(countLines(caption), 2);
  // Rolling captions: three lines.
  assert.equal(countLines([...caption, box(220, 344, 200)]), 3);
  assert.ok(countLines([...caption, box(220, 344, 200)]) <= DANMAKU.maxLines);
  // Comments in lanes across the top half, two sharing a lane far apart.
  const comments = [
    box(30, 10, 120),
    box(400, 10, 90),
    box(180, 40, 150),
    box(520, 70, 100),
    box(90, 100, 60),
  ];
  assert.equal(countLines(comments), 5);
  assert.ok(countLines(comments) > DANMAKU.maxLines);
});

test("a box moving across the video is a comment; a caption box whose text changes isn't", () => {
  // Centred caption, longer line: grows both ways.
  assert.equal(
    movedSideways(box(250, 300, 140), box(200, 300, 240), FRAME_WIDTH),
    false,
  );
  // Left-aligned caption: its left edge stays.
  assert.equal(
    movedSideways(box(40, 300, 140), box(40, 300, 260), FRAME_WIDTH),
    false,
  );
  // Moved up when the player's controls show.
  assert.equal(
    movedSideways(box(250, 300, 140), box(250, 260, 140), FRAME_WIDTH),
    false,
  );
  // Slid right to left, its text replaced or not.
  assert.equal(
    movedSideways(box(500, 40, 120), box(430, 40, 120), FRAME_WIDTH),
    true,
  );
  assert.equal(
    movedSideways(box(500, 40, 120), box(430, 40, 150), FRAME_WIDTH),
    true,
  );
  // Reused for the next comment: back at the right edge.
  assert.equal(
    movedSideways(box(20, 40, 120), box(640, 40, 80), FRAME_WIDTH),
    true,
  );
});

test("animations that move an element sideways are told from others", () => {
  // Comments: CSS animations and transitions on transform or left.
  assert.ok(
    movesSideways([
      { transform: "translateX(0px)", offset: 0 },
      { transform: "translateX(-100%)", offset: 1 },
    ]),
  );
  assert.ok(
    movesSideways([
      { transform: "matrix(1, 0, 0, 1, 640, 0)" },
      { transform: "matrix(1, 0, 0, 1, -200, 0)" },
    ]),
  );
  assert.ok(
    movesSideways([
      { transform: "none" },
      { transform: "translate3d(-800px, 0px, 0px)" },
    ]),
  );
  assert.ok(movesSideways([{ left: "100%" }, { left: "-20%" }]));
  assert.ok(movesSideways([{ translate: "640px" }, { translate: "-50px" }]));
  // A caption box fading in, moving up, or growing.
  assert.equal(movesSideways([{ opacity: "0" }, { opacity: "1" }]), false);
  assert.equal(
    movesSideways([
      { transform: "translateY(0px)" },
      { transform: "translateY(-40px)" },
    ]),
    false,
  );
  assert.equal(
    movesSideways([
      { transform: "none" },
      { transform: "matrix(1, 0, 0, 1, 0, -40)" },
    ]),
    false,
  );
  assert.equal(
    movesSideways([{ transform: "scale(0.9)" }, { transform: "scale(1)" }]),
    false,
  );
  assert.equal(
    movesSideways([{ translate: "0 0" }, { translate: "0 -40px" }]),
    false,
  );
  assert.equal(movesSideways([{ bottom: "40px" }, { bottom: "80px" }]), false);
});

test("comments added one after another are a stream; replaced caption lines aren't", () => {
  const now = 10_000;
  // A comment every 300 ms, each still flying.
  assert.ok(isStream([8_500, 8_800, 9_100, 9_400, 9_700], now));
  // A caption player adding a line every two seconds keeps the last few.
  assert.equal(isStream([6_000, 8_000, 10_000], now), false);
  // Many lines added long ago, still kept, then a quiet stretch.
  assert.equal(
    isStream([1_000, 1_300, 1_600, 1_900, 2_200, 9_900], now),
    false,
  );
});
