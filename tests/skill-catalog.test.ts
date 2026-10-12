import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { renderMessageText } from "../src/background/message-helpers";
import { createSystemPrompt } from "../src/background/system-prompt";
import { readTool } from "../src/background/tools/read";
import { skillsTool } from "../src/background/tools/skills";
import type { ToolContext } from "../src/background/tools/types";
import { DEFAULT_AGENT } from "../src/shared/agents";
import { BUILTIN_SKILLS } from "../src/shared/builtin-skills";
import {
  SKILL_DESCRIPTION_MAX_CHARS,
  SKILL_LISTING_MAX_CHARS,
} from "../src/shared/config";
import {
  availableSkills,
  listedSkills,
  resolveSkillCatalog,
  setSkillInvokeMode,
  skillListingLine,
  skillListingSize,
} from "../src/shared/skill-catalog";
import {
  createSkillPackage,
  getSkillInstruction,
  toPickedSkill,
} from "../src/shared/skills";
import { storage } from "../src/shared/storage";
import type { ChatMessage, Skill } from "../src/shared/types";
import {
  filterSkills,
  slashSkillQuery,
  takeSlashSkill,
} from "../entrypoints/sidepanel/skill-context";
import { installBrowser } from "./helpers";

const creator = BUILTIN_SKILLS.find((skill) => skill.name === "skill-creator")!;
let browser: ReturnType<typeof installBrowser>;

beforeEach(() => {
  browser = installBrowser();
});

async function catalog() {
  return resolveSkillCatalog(
    await storage.skills.get(),
    await storage.skillSettings.get(),
  );
}

function run(skills: Skill[]) {
  return { run: { skills } } as unknown as ToolContext;
}

test("a changed built-in reaches a profile that already exists", async () => {
  // A profile from the copy-on-first-run days holds an old built-in copy.
  const own = createSkillPackage({ name: "mine", description: "Mine" });
  browser.local.data.skills = [
    { ...creator, files: [], description: "old text", builtin: true },
    own,
  ];
  const stored = await storage.skills.get();
  assert.deepEqual(
    stored.map((skill) => skill.name),
    ["mine"],
  );
  const entry = (await catalog()).find(
    (item) => item.skill.name === "skill-creator",
  )!;
  assert.equal(entry.source, "builtin");
  assert.equal(entry.skill, creator);
  const changed = { ...creator, description: "Shipped in the next version" };
  const next = resolveSkillCatalog(stored, {}, [changed]);
  assert.equal(next[0].skill.description, "Shipped in the next version");
});

test("a user copy overrides the built-in; deleting it brings the built-in back", async () => {
  const copy = createSkillPackage({
    name: "skill-creator",
    description: "My way of writing skills",
    instruction: "Custom instructions",
  });
  await storage.skills.set([copy]);
  const entries = await catalog();
  const entry = entries.find((item) => item.skill.name === "skill-creator")!;
  assert.equal(entry.source, "override");
  assert.equal(entry.skill.id, copy.id);
  assert.equal(
    entries.filter((item) => item.skill.name === "skill-creator").length,
    1,
  );
  const read = await readTool.execute(
    { source: "skill:skill-creator" },
    run(availableSkills(entries)),
  );
  assert.match(read.text, /Custom instructions/);

  await storage.skills.set([]);
  const restored = (await catalog()).find(
    (item) => item.skill.name === "skill-creator",
  )!;
  assert.equal(restored.source, "builtin");
  assert.equal(restored.skill, creator);
});

test("changing a built-in with the skills tool saves an override, never the built-in", async () => {
  await storage.skillSettings.set(setSkillInvokeMode({}, creator.id, "manual"));
  const context = run(availableSkills(await catalog()));
  const result = await skillsTool.execute(
    {
      action: "patch",
      name: "skill-creator",
      find: "# Skill Creator",
      content: "# Skill Creator (mine)",
    },
    context,
  );
  assert.equal(result.isError, undefined);
  const stored = await storage.skills.get();
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].id, creator.id);
  assert.equal(stored[0].builtin, undefined);
  assert.match(getSkillInstruction(stored[0]), /# Skill Creator \(mine\)/);
  assert.doesNotMatch(getSkillInstruction(creator), /\(mine\)/);
  const entry = (await catalog()).find(
    (item) => item.skill.name === "skill-creator",
  )!;
  assert.equal(entry.source, "override");
  assert.equal(entry.invoke, "manual");
  const read = await readTool.execute(
    { source: "skill:skill-creator" },
    context,
  );
  assert.match(read.text, /\(mine\)/);
});

test("built-ins are never written to storage or sync", async () => {
  assert.deepEqual(await storage.skills.get(), []);
  await catalog();
  const builtinIds = BUILTIN_SKILLS.map((skill) => skill.id);
  for (const area of [browser.local.data, browser.sync.data]) {
    const text = JSON.stringify(area);
    for (const id of builtinIds) assert.equal(text.includes(id), false);
  }
  assert.equal(browser.sync.writes.length, 0);
});

test("a manual skill is left out of the prompt but works when picked", () => {
  const manual = createSkillPackage({
    name: "weekly-report",
    description: "Write the weekly report",
    instruction: "Report for {{ date }}: list wins first.",
  });
  const settings = setSkillInvokeMode({}, manual.id, "manual");
  const entries = resolveSkillCatalog([manual], settings);
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: listedSkills(entries),
    bridges: 0,
  });
  assert.doesNotMatch(system, /weekly-report/);
  assert.match(system, /skill-creator/);

  const message: ChatMessage = {
    id: "m",
    role: "user",
    content: "Do it",
    createdAt: 1,
    metadata: { skills: [toPickedSkill(manual)] },
  };
  const text = renderMessageText(message, {
    latest: true,
    attachments: [],
    skills: availableSkills(entries),
  });
  assert.match(text, /<skill name="weekly-report">/);
  assert.match(text, /picked this skill for this request/);
  assert.match(text, /Report for \d{4}-\d{2}-\d{2}: list wins first\./);
  assert.match(text, /<message>\nDo it\n<\/message>/);
  // Later turns keep a note of the pick, not the instructions.
  const earlier = renderMessageText(message, {
    latest: false,
    attachments: [],
    skills: availableSkills(entries),
  });
  assert.match(earlier, /picked skill:weekly-report/);
  assert.doesNotMatch(earlier, /list wins first/);

  const off = resolveSkillCatalog(
    [manual],
    setSkillInvokeMode({}, manual.id, "off"),
  );
  assert.equal(
    availableSkills(off).some((skill) => skill.id === manual.id),
    false,
  );
});

test("long descriptions are cut and an over-budget list is reported", () => {
  const long = createSkillPackage({
    name: "long",
    description: "x".repeat(SKILL_DESCRIPTION_MAX_CHARS * 2),
  });
  assert.ok(skillListingLine(long).length < SKILL_DESCRIPTION_MAX_CHARS + 20);
  assert.equal(skillListingSize(BUILTIN_SKILLS).overBudget, false);
  const many = Array.from({ length: 40 }, (_, index) =>
    createSkillPackage({
      name: `skill-${index}`,
      description: "y".repeat(SKILL_DESCRIPTION_MAX_CHARS),
    }),
  );
  const size = skillListingSize(many);
  assert.ok(size.chars > SKILL_LISTING_MAX_CHARS);
  assert.equal(size.overBudget, true);
  // Nothing is dropped: every skill is still listed.
  const system = createSystemPrompt({
    agent: DEFAULT_AGENT,
    skills: many,
    bridges: 0,
  });
  assert.match(system, /skill-39/);
});

test("the slash picker filters skills and the rest of the text is the request", () => {
  const skills = [
    createSkillPackage({ name: "deep-research", description: "Research" }),
    createSkillPackage({ name: "compare", description: "Compare research" }),
  ];
  assert.equal(slashSkillQuery("/dee"), "dee");
  assert.equal(slashSkillQuery("/"), "");
  assert.equal(slashSkillQuery("/deep-research now"), undefined);
  assert.equal(slashSkillQuery("hello /dee"), undefined);
  assert.deepEqual(
    filterSkills(skills, "res").map((skill) => skill.name),
    ["deep-research", "compare"],
  );
  assert.deepEqual(
    filterSkills(skills, "comp").map((skill) => skill.name),
    ["compare"],
  );
  const taken = takeSlashSkill("/deep-research what changed in 2026?", skills);
  assert.equal(taken?.skill.name, "deep-research");
  assert.equal(taken?.rest, "what changed in 2026?");
  assert.equal(takeSlashSkill("/unknown do it", skills), undefined);
});
