import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILTIN_SKILLS } from "../src/shared/builtin-skills";
import { SKILL_DESCRIPTION_MAX_CHARS } from "../src/shared/config";
import {
  getSkillBody,
  parseSkillFrontmatter,
  validateSkill,
} from "../src/shared/skills";
import { TOOL_NAME } from "../src/shared/tool-names";

const TOOLS = new Set<string>(Object.values(TOOL_NAME));
// Installer output fields the bridge skill names.
const FIELDS = new Set(["hostName", "commandId", "bridgeKey"]);

test("built-in skills are complete, short and name real tools", () => {
  const names = new Set<string>();
  for (const skill of BUILTIN_SKILLS) {
    assert.equal(names.has(skill.name), false, skill.name);
    names.add(skill.name);
    assert.equal(skill.id, `builtin-${skill.name}`);
    assert.ok(
      validateSkill(skill).every((check) => check.ok),
      `${skill.name} is valid`,
    );
    assert.ok(
      skill.description.length <= SKILL_DESCRIPTION_MAX_CHARS,
      `${skill.name} description fits the listing`,
    );
    const entry = skill.files[0];
    assert.deepEqual(parseSkillFrontmatter(entry.content), {
      name: skill.name,
      description: skill.description,
    });
    const body = getSkillBody(skill);
    assert.ok(body.split("\n").length < 150, `${skill.name} body is short`);
    // Backticked single words that look like tool names must be real tools.
    for (const [, word] of body.matchAll(/`([a-z][A-Za-z]+)`/g))
      if (/^[a-z]+[A-Z]/.test(word) || ["tabs", "read", "act"].includes(word))
        assert.ok(
          TOOLS.has(word) || FIELDS.has(word),
          `${skill.name} names tool ${word}`,
        );
  }
});
