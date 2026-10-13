import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMcpServers } from "../src/shared/mcp";
import { keepStoredForm } from "../src/shared/stored-form";

const item = (id: string, value = "v") => ({ id, value });
// Reading fills in `filled` (a built-in) before the stored items.
const read = (stored: Array<{ id: string; value: string }> = []) => [
  item("filled"),
  ...stored,
];

test("a list never stored: a change stores only what it added", () => {
  const shown = read();
  const next = [...shown, item("new")];
  assert.deepEqual(keepStoredForm(undefined, shown, next), [item("new")]);
});

test("an item filled in on read and left alone is not stored; one the change edited is", () => {
  const stored = [item("a")];
  const shown = read(stored);
  assert.deepEqual(
    keepStoredForm(stored, shown, [shown[0], item("a", "edited")]),
    [item("a", "edited")],
  );
  assert.deepEqual(
    keepStoredForm(stored, shown, [item("filled", "edited"), shown[1]]),
    [item("filled", "edited"), item("a")],
  );
});

test("a change that reorders the list stores the items filled in on read with their place", () => {
  const stored = [item("a")];
  const shown = read(stored);
  assert.deepEqual(keepStoredForm(stored, shown, [shown[1], shown[0]]), [
    item("a"),
    item("filled"),
  ]);
});

test("stored items reading dropped stay, in their place", () => {
  const unknown = { id: "z", kind: "from a newer version" };
  const stored = [item("a"), unknown, item("b")];
  const shown = [item("a"), item("b")];
  assert.deepEqual(keepStoredForm(stored, shown, [...shown, item("c")]), [
    item("a"),
    unknown,
    item("b"),
    item("c"),
  ]);
  // Also inside an item's fields (a list a record holds).
  assert.deepEqual(
    keepStoredForm({ list: stored }, { list: shown }, { list: [item("a")] }),
    { list: [item("a"), unknown] },
  );
});

test("built-in MCP servers read back in the order they were shown, whichever are stored", () => {
  const ids = (value: unknown) =>
    normalizeMcpServers(value).map((server) => server.id);
  const all = ids(undefined);
  assert.deepEqual(ids([{ id: all[1], url: "u" }]), all);
  assert.deepEqual(
    ids([
      { id: all[2], url: "u" },
      { id: "own", url: "u" },
    ]),
    [...all, "own"],
  );
  // Reading what reading gave changes nothing.
  const shown = normalizeMcpServers(undefined);
  assert.deepEqual(normalizeMcpServers(shown), shown);
});
