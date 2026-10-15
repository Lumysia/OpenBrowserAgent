import assert from "node:assert/strict";
import { test } from "node:test";
import {
  edgePoint,
  keyDirection,
  KEY_STEP,
  moveAlong,
  nextEdge,
  snapToEdge,
  clampPoint,
} from "../src/page-translate-button/geometry";

const viewport = { width: 1000, height: 600 };

test("a dragged button lets go onto the nearest edge and keeps its place along it", () => {
  assert.deepEqual(snapToEdge({ x: 980, y: 300 }, viewport), {
    edge: "right",
    along: 0.5,
  });
  assert.deepEqual(snapToEdge({ x: 30, y: 150 }, viewport), {
    edge: "left",
    along: 0.25,
  });
  assert.deepEqual(snapToEdge({ x: 250, y: 20 }, viewport), {
    edge: "top",
    along: 0.25,
  });
  assert.deepEqual(snapToEdge({ x: 750, y: 590 }, viewport), {
    edge: "bottom",
    along: 0.75,
  });
  // Mid-page, nearer the bottom than the sides.
  assert.equal(snapToEdge({ x: 500, y: 400 }, viewport).edge, "bottom");
});

test("the same place on any window size, always inside it", () => {
  const position = { edge: "right" as const, along: 2 / 3 };
  assert.deepEqual(edgePoint(position, viewport, 28), { x: 1000, y: 400 });
  assert.deepEqual(edgePoint(position, { width: 500, height: 300 }, 28), {
    x: 500,
    y: 200,
  });
  // Kept off the corners.
  assert.deepEqual(edgePoint({ edge: "top", along: 0 }, viewport, 28), {
    x: 28,
    y: 0,
  });
  assert.deepEqual(edgePoint({ edge: "bottom", along: 1 }, viewport, 28), {
    x: 972,
    y: 600,
  });
  // A window smaller than the margins puts it in the middle.
  assert.deepEqual(
    edgePoint({ edge: "left", along: 0.1 }, { width: 40, height: 40 }, 28),
    { x: 0, y: 20 },
  );
  assert.deepEqual(clampPoint({ x: -50, y: 700 }, viewport, 18), {
    x: 18,
    y: 582,
  });
});

test("arrow keys move it along its edge, E to the next edge", () => {
  assert.equal(keyDirection("right", "ArrowUp"), -1);
  assert.equal(keyDirection("right", "ArrowDown"), 1);
  assert.equal(keyDirection("right", "ArrowLeft"), 0);
  assert.equal(keyDirection("top", "ArrowRight"), 1);
  assert.equal(keyDirection("bottom", "ArrowUp"), 0);
  assert.deepEqual(moveAlong({ edge: "left", along: 0.5 }, 1), {
    edge: "left",
    along: 0.5 + KEY_STEP,
  });
  assert.deepEqual(moveAlong({ edge: "left", along: 0.01 }, -1), {
    edge: "left",
    along: 0,
  });
  const edges = [];
  let position = { edge: "right" as const, along: 0.3 } as Parameters<
    typeof nextEdge
  >[0];
  for (let i = 0; i < 4; i++) {
    position = nextEdge(position);
    edges.push(position.edge);
  }
  assert.deepEqual(edges, ["bottom", "left", "top", "right"]);
  assert.equal(position.along, 0.3);
});
