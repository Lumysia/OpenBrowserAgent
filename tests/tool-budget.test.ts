import assert from "node:assert/strict";
import test from "node:test";
import { toolBudget } from "../src/background/tool-budget";

// The notes each step's results get, for a run of `max` steps.
const notes = (max: number) => {
  const budget = toolBudget(max);
  return Array.from({ length: max + 1 }, (_, done) => budget.note(done));
};

test("a run is told once when few tool steps are left, and at the last", () => {
  const fifty = notes(50);
  assert.equal(
    fifty[44],
    "[5 tool steps left: leave room to check the result and answer.]",
  );
  assert.equal(
    fifty[49],
    "[That was the last tool step: answer now with what you know.]",
  );
  assert.equal(fifty.filter(Boolean).length, 2);
  // A tenth of a large limit.
  const hundred = notes(100);
  assert.match(hundred[89], /^\[10 tool steps left/);
  assert.equal(hundred.filter(Boolean).length, 2);
  // A small limit: warned at the first step.
  assert.deepEqual(notes(2), [
    "[1 tool step left: leave room to check the result and answer.]",
    "[That was the last tool step: answer now with what you know.]",
    "",
  ]);
  assert.deepEqual(notes(1), [
    "[That was the last tool step: answer now with what you know.]",
    "",
  ]);
});

test("parallel calls of one step get the note once", () => {
  const budget = toolBudget(10);
  assert.match(budget.note(4), /5 tool steps left/);
  assert.equal(budget.note(4), "");
  assert.match(budget.note(9), /last tool step/);
  assert.equal(budget.note(9), "");
});
