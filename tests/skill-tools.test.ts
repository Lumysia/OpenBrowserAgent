import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { skillsTool } from "../src/background/tools/skills";
import type { ToolContext } from "../src/background/tools/types";
import { storage } from "../src/shared/storage";
import { createSkillPackage } from "../src/shared/skills";

afterEach(() => mock.restoreAll());

test("skill patches keep literal replacement tokens and later edits to other files", async () => {
  const skill = createSkillPackage({
    name: "fixture",
    description: "Fixture",
    instruction: "original",
  });
  const stored = [structuredClone(skill)];
  const run = { skills: [structuredClone(skill)] };
  mock.method(storage.skills, "get", async () => structuredClone(stored));
  mock.method(storage.skillSettings, "get", async () => ({}));
  mock.method(
    storage.skills,
    "update",
    async (updater: (current: typeof stored) => typeof stored) => {
      const value = updater(structuredClone(stored));
      stored.splice(0, stored.length, ...value);
      return value;
    },
  );
  // Another context adds a file after this run loaded its skills.
  stored[0].files.push({
    path: "reference.md",
    kind: "markdown",
    encoding: "utf-8",
    content: "added after run started",
    updatedAt: 2,
  });
  const replacement = "$& $$ $` $'";
  const result = await skillsTool.execute(
    {
      action: "patch",
      name: "fixture",
      find: "original",
      content: replacement,
    },
    { run } as unknown as ToolContext,
  );
  assert.equal(result.isError, undefined);
  const entry = stored[0].files.find((file) => file.path === "SKILL.md");
  assert.ok(entry?.content.includes(replacement));
  assert.equal(
    stored[0].files.find((file) => file.path === "reference.md")?.content,
    "added after run started",
  );
  assert.deepEqual(run.skills, stored);
});

test("the skills tool says deleting and renaming happen in Settings", () => {
  assert.match(
    skillsTool.description,
    /cannot delete or rename a skill: the user does that in Settings → Skills, so tell them where/,
  );
});
