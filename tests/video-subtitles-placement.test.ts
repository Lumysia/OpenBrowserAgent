import assert from "node:assert/strict";
import { test } from "node:test";
import {
  layerPlacement,
  visibleBox,
  type Box,
} from "../src/video-subtitles/placement";

test("subtitles cover the part of the video its player shows", () => {
  const viewport: Box = { left: 0, top: 0, right: 1200, bottom: 800 };
  // A video wider than its player and pushed down, inside a player that
  // clips it.
  const video: Box = { left: 100, top: 120, right: 1000, bottom: 620 };
  const player: Box = { left: 100, top: 100, right: 900, bottom: 550 };
  const visible = visibleBox(
    video,
    [{ box: player, x: true, y: true }],
    viewport,
  );
  assert.deepEqual(visible, { left: 100, top: 120, right: 900, bottom: 550 });
  const placed = layerPlacement(visible!, viewport.bottom);
  assert.equal(placed.left, 100);
  assert.equal(placed.width, 800);
  // Above the player's bottom edge (its controls), not the video's.
  assert.equal(placed.bottom, 800 - 550 + 430 * 0.1);
  assert.equal(placed.size, 430 * 0.042);

  // An ancestor clipping one axis only, and the viewport.
  assert.deepEqual(
    visibleBox(
      { left: -50, top: 700, right: 600, bottom: 1000 },
      [
        {
          box: { left: 0, top: 0, right: 500, bottom: 100 },
          x: true,
          y: false,
        },
      ],
      viewport,
    ),
    { left: 0, top: 700, right: 500, bottom: 800 },
  );
  // Clipped away entirely.
  assert.equal(
    visibleBox(
      video,
      [{ box: { ...player, top: 700, bottom: 750 }, x: true, y: true }],
      viewport,
    ),
    undefined,
  );
});
