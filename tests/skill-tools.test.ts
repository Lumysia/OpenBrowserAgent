import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { manageSkills } from "../src/background/skill-tools";
import { storage } from "../src/shared/storage";
import { createSkillPackage } from "../src/shared/skills";

afterEach(() => mock.restoreAll());

function setup() {
  const skill = createSkillPackage({
    name: "fixture",
    description: "Fixture",
    instruction: "original",
  });
  const available = [structuredClone(skill)];
  const stored = [skill];
  mock.method(storage.skills, "get", async () => structuredClone(stored));
  const write = mock.method(storage.skills, "set", async (value) => {
    stored.splice(0, stored.length, ...value);
  });
  const input = {
    operation: "patchFile",
    skillId: skill.id,
    path: "SKILL.md",
    reason: "Preserve literal examples",
  };
  return { skill, available, stored, write, input };
}

test("skill patches persist literal replacement tokens and retain later edits to other files", async () => {
  const run = setup();
  run.skill.files.push({
    path: "reference.md",
    kind: "markdown",
    encoding: "utf-8",
    content: "added after run started",
    updatedAt: 2,
  });
  const replacement = "$& $$ $` $'";
  const result = await manageSkills(run.available, {
    ...run.input,
    replacements: [{ oldText: "original", newText: replacement }],
  });
  assert.ok("patched" in result && result.patched);
  assert.ok(run.stored[0].files[0].content.includes(replacement));
  assert.equal(run.stored[0].files[1].content, "added after run started");
  assert.deepEqual(run.available, run.stored);
});

for (const replacements of [
  [{ oldText: "original", newText: "changed" }, null],
  [
    { oldText: "original", newText: "changed" },
    { oldText: "missing", newText: "bad" },
  ],
  [
    { oldText: "original", newText: "duplicate duplicate" },
    { oldText: "duplicate", newText: "bad" },
  ],
]) {
  test("invalid skill patch batches make no partial persistent or in-run edits", async () => {
    const run = setup();
    const original = structuredClone(run.available);
    const result = await manageSkills(run.available, {
      ...run.input,
      replacements,
    });
    assert.ok("error" in result);
    assert.equal(run.write.mock.callCount(), 0);
    assert.deepEqual(run.available, original);
    assert.deepEqual(run.stored, original);
  });
}
