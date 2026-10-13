import assert from "node:assert/strict";
import test from "node:test";
import { syncCollection } from "../src/shared/sync/collections";
import { createWorkspace } from "../src/shared/workspace";

// Workspaces two devices changed without a shared base merge from the
// default files, except where the side holding a default file's text is
// the newer edit of that file: a file set back to its default then counts
// as an edit.

const workspaces = syncCollection("workspaces")!;
const file = (path: string, content: string, updatedAt: number) => ({
  path,
  content,
  kind: "markdown",
  updatedAt,
});
const CLEARED = "# Memory\n\n";
const FACTS = "# Memory\n\nold facts";
const merge = (mine: unknown[], theirs: unknown[], newer: "mine" | "theirs") =>
  (
    workspaces.mergeBodies!(undefined, mine, theirs, newer, "x") as Array<{
      path: string;
      content: string;
    }>
  ).map((entry) => [entry.path, entry.content]);

test("review8 W1: no base, a newer clear of MEMORY.md to its default text wins and the older text is kept beside it", () => {
  const mine = [file("MEMORY.md", CLEARED, 9)];
  const theirs = [file("MEMORY.md", FACTS, 3)];
  assert.deepEqual(merge(mine, theirs, "mine"), [
    ["MEMORY.md", CLEARED],
    ["MEMORY.conflict-x.md", FACTS],
  ]);
  // The other device's record is the newer one: its text keeps the name,
  // the clear is kept beside it.
  assert.deepEqual(merge(mine, theirs, "theirs"), [
    ["MEMORY.md", FACTS],
    ["MEMORY.conflict-x.md", CLEARED],
  ]);
});

test("review8 W1: no base, an older clear loses to the newer text", () => {
  const mine = [file("MEMORY.md", CLEARED, 3)];
  const theirs = [file("MEMORY.md", FACTS, 9)];
  assert.deepEqual(merge(mine, theirs, "theirs"), [["MEMORY.md", FACTS]]);
});

test("review8 W1: default files a new workspace holds were never edited: any real edit wins", () => {
  const created = createWorkspace("ag", 50).files;
  assert.ok(created.every((entry) => entry.updatedAt === 0));
  const real = [file("MEMORY.md", FACTS, 3)];
  assert.deepEqual(merge(real, created, "theirs"), [["MEMORY.md", FACTS]]);
  assert.deepEqual(merge(created, real, "mine"), [["MEMORY.md", FACTS]]);
});
