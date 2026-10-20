import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { skillCheckTool } from "../src/background/tools/skill-check";
import { skillsTool } from "../src/background/tools/skills";
import type { ToolContext } from "../src/background/tools/types";
import {
  getSkillBody,
  getSkillMetadata,
  replaceSkillEntryFile,
} from "../src/shared/skills";
import { storage } from "../src/shared/storage";
import {
  buildRecordedSkill,
  DEMONSTRATION_PATH,
  guardSkillEdit,
  recordedSkillInfo,
  withRecordedStatus,
} from "../src/shared/teach/skill-files";
import type { Skill } from "../src/shared/types";
import { installChrome } from "./fake-chrome";

// "Verified" is set by the check run only: no edit can forge it, an edit
// of the instructions or the demonstration makes the skill a draft again,
// and so does a failed check.

const NAME = "submit-order";

function recorded(status: "draft" | "verified" = "draft") {
  const skill = buildRecordedSkill({
    session: { steps: [], startUrl: "https://shop.test/orders", startedAt: 1 },
    draft: { name: NAME, description: "Submits.", body: "## Steps\n1. Go." },
    existingNames: [],
  });
  return status === "verified" ? withRecordedStatus(skill, status) : skill;
}

const context = (skills: Skill[], extra: object = {}) =>
  ({
    run: { skills: structuredClone(skills), ...extra },
  }) as unknown as ToolContext;

async function stored(name = NAME) {
  return (await storage.skills.get()).find((skill) => skill.name === name)!;
}

beforeEach(() => {
  installChrome();
});

test("an agent's patch cannot mark a recorded draft verified", async () => {
  await storage.skills.replace([recorded()]);
  const result = await skillsTool.execute(
    {
      action: "patch",
      name: NAME,
      find: 'status: "draft"',
      content: 'status: "verified"',
    },
    context(await storage.skills.get()),
  );
  assert.equal(result.isError, undefined);
  assert.equal(recordedSkillInfo(await stored())?.status, "draft");
});

test("an agent's write cannot drop or forge the recorded marks", async () => {
  await storage.skills.replace([recorded()]);
  await skillsTool.execute(
    {
      action: "write",
      name: NAME,
      content: `---\nname: "${NAME}"\ndescription: "Submits."\nmetadata:\n  source: "mine"\n  status: "verified"\n  note: "kept"\n---\n\n## Steps\n1. Go.`,
    },
    context(await storage.skills.get()),
  );
  const metadata = getSkillMetadata(await stored());
  assert.equal(metadata.source, "demonstration");
  assert.equal(metadata.status, "draft");
  assert.equal(metadata.note, "kept");
});

test("skills create cannot make a recorded or verified skill", async () => {
  await skillsTool.execute(
    {
      action: "create",
      name: "pay-invoice",
      content:
        '---\nname: "pay-invoice"\ndescription: "x"\nmetadata:\n  source: "demonstration"\n  status: "verified"\n---\n\nDo it.',
    },
    context([]),
  );
  assert.notEqual(
    recordedSkillInfo(await stored("pay-invoice"))?.status,
    "verified",
  );
});

test("a verified skill whose steps the agent rewrites is a draft again", async () => {
  await storage.skills.replace([recorded("verified")]);
  await skillsTool.execute(
    {
      action: "write",
      name: NAME,
      content: `---\nname: "${NAME}"\ndescription: "Submits."\n---\n\nCompletely different steps.`,
    },
    context(await storage.skills.get()),
  );
  const skill = await stored();
  assert.equal(getSkillBody(skill), "Completely different steps.");
  assert.equal(recordedSkillInfo(skill)?.status, "draft");
});

test("a verified skill whose demonstration changes is a draft again", async () => {
  await storage.skills.replace([recorded("verified")]);
  await skillsTool.execute(
    {
      action: "write",
      name: NAME,
      path: DEMONSTRATION_PATH,
      content: '{"steps": []}',
    },
    context(await storage.skills.get()),
  );
  assert.equal(recordedSkillInfo(await stored())?.status, "draft");
});

test("Settings keeps the marks and makes an edited verified skill a draft", () => {
  const verified = recorded("verified");
  // A rename keeps it verified.
  const renamed = {
    ...verified,
    files: replaceSkillEntryFile(
      verified,
      NAME,
      "Submits orders.",
      getSkillBody(verified),
    ),
  };
  assert.equal(
    recordedSkillInfo(guardSkillEdit(verified, renamed))?.status,
    "verified",
  );
  // New steps make it a draft.
  const edited = {
    ...verified,
    files: replaceSkillEntryFile(verified, NAME, "Submits.", "Settings edit"),
  };
  assert.equal(
    recordedSkillInfo(guardSkillEdit(verified, edited))?.status,
    "draft",
  );
  // Typing the status into SKILL.md does not verify a draft.
  const draft = recorded();
  const forged = {
    ...draft,
    files: draft.files.map((file) =>
      file.path === "SKILL.md"
        ? { ...file, content: file.content.replace('"draft"', '"verified"') }
        : file,
    ),
  };
  assert.equal(
    recordedSkillInfo(guardSkillEdit(draft, forged))?.status,
    "draft",
  );
});

test("an imported skill is never verified", () => {
  assert.equal(
    recordedSkillInfo(guardSkillEdit(undefined, recorded("verified")))?.status,
    "draft",
  );
});

test("a failed check makes a verified skill a draft; a pass verifies it", async () => {
  const skill = recorded("verified");
  await storage.skills.replace([skill]);
  const run = { chatId: "c", skillCheck: { skillId: skill.id } };
  await skillCheckTool.execute(
    { passed: false, divergedAt: 2, summary: "Button gone." },
    context([], run),
  );
  assert.equal(recordedSkillInfo(await stored())?.status, "draft");
  await skillCheckTool.execute(
    { passed: true, summary: "Worked." },
    context([], run),
  );
  assert.equal(recordedSkillInfo(await stored())?.status, "verified");
});
