import assert from "node:assert/strict";
import { test } from "node:test";
import { SKILL_NAME_MAX_LENGTH } from "../src/shared/config";
import {
  resolveSkillCatalog,
  setSkillInvokeMode,
  skillInvokeMode,
} from "../src/shared/skill-catalog";
import {
  copySkill,
  getSkillBody,
  getSkillMetadata,
  keepSkillMetadata,
  normalizeSkill,
  normalizeSkills,
  parseSkillFrontmatter,
  replaceSkillEntryFile,
  validateSkill,
} from "../src/shared/skills";
import {
  buildRecordedSkill,
  DEMONSTRATION_PATH,
  offersAutomaticUse,
  parseDraft,
  RECORDED_SKILL_INVOKE,
  recordedSkillInfo,
  recordedSkillName,
  withRecordedStatus,
} from "../src/shared/teach/skill-files";
import { buildTranscript } from "../src/shared/teach/transcript";
import type { TeachSession, TeachStep } from "../src/shared/teach/types";

const page = { title: "Timesheet", url: "https://hr.test/timesheet" };
const steps: TeachStep[] = [
  {
    id: "1",
    kind: "field",
    at: 1,
    page,
    target: {
      role: "textbox",
      name: "Email",
      label: "Email",
      tag: "input",
      container: "form Sign in",
    },
    field: { inputType: "email", length: 17, secret: false },
  },
  {
    id: "2",
    kind: "field",
    at: 2,
    page,
    target: { role: "textbox", name: "Password", tag: "input" },
    field: { inputType: "password", length: 9, secret: true, submitted: true },
    leadsTo: "https://hr.test/week/*",
  },
  {
    id: "3",
    kind: "choose",
    at: 3,
    page: { title: "Week", url: "https://hr.test/week/*" },
    target: { role: "combobox", name: "Project", tag: "select" },
    choice: "Apollo",
    varies: true,
  },
  {
    id: "4",
    kind: "click",
    at: 4,
    page: { title: "Week", url: "https://hr.test/week/*" },
    target: { role: "button", name: "Submit", tag: "button" },
    leadsTo: "https://hr.test/done",
  },
];

const session: TeachSession = {
  id: "s",
  tabId: 1,
  tabIds: [1],
  startedAt: Date.UTC(2026, 9, 19, 12),
  lastEventAt: 4,
  startUrl: "https://hr.test/timesheet",
  purpose: "Submit my weekly timesheet",
  varies: "the project",
  steps,
  state: "review",
  dropped: 0,
};

const MODEL_REPLY = `\`\`\`markdown
---
name: "Submit Weekly Timesheet"
description: "Submits the weekly timesheet on hr.test. Use when the user asks to submit or file their timesheet. Inputs: email, password (sensitive), project."
---

# Submit weekly timesheet

## Goal
Submit this week's timesheet.
\`\`\``;

test("the transcript withholds values and marks secrets and choices", () => {
  const transcript = buildTranscript(session);
  assert.match(transcript, /«value withheld: field 'Email'»/);
  assert.match(transcript, /«secret value withheld: field 'Password'/);
  assert.match(transcript, /1\. Type into textbox "Email".*in form Sign in/);
  assert.match(
    transcript,
    /then press Enter → the page changes to https:\/\/hr\.test\/week\/\*/,
  );
  assert.match(
    transcript,
    /3\. Choose "Apollo" in combobox "Project".*changes each time/,
  );
  assert.match(
    transcript,
    /What it is for \(the user's words\): Submit my weekly timesheet/,
  );
  assert.match(
    transcript,
    /^On page "Week" \(https:\/\/hr\.test\/week\/\*\):$/m,
  );
});

test("skill names follow the Agent Skills rules and are made unique", () => {
  assert.equal(
    recordedSkillName("Submit Weekly Timesheet!", []),
    "submit-weekly-timesheet",
  );
  assert.equal(
    recordedSkillName("submit-weekly-timesheet", ["submit-weekly-timesheet"]),
    "submit-weekly-timesheet-2",
  );
  assert.equal(
    recordedSkillName("submit-weekly-timesheet", [
      "submit-weekly-timesheet",
      "submit-weekly-timesheet-2",
    ]),
    "submit-weekly-timesheet-3",
  );
  assert.equal(recordedSkillName("!!!", []), "recorded-task");
  const long =
    "export-the-monthly-sales-report-from-the-shop-admin-dashboard-as-csv";
  const named = recordedSkillName(long, []);
  assert.ok(named.length <= SKILL_NAME_MAX_LENGTH);
  assert.doesNotMatch(named, /^-|-$|--/);
  const second = recordedSkillName(long, [named]);
  assert.ok(second.length <= SKILL_NAME_MAX_LENGTH);
  assert.match(second, /-2$/);
  assert.doesNotMatch(second, /--/);
});

test("a recorded skill is a SKILL.md plus a value-free demonstration file", () => {
  const draft = parseDraft(MODEL_REPLY);
  assert.equal(draft.name, "submit-weekly-timesheet");
  const skill = buildRecordedSkill({
    session,
    draft,
    existingNames: ["fill-form"],
    now: 5,
  });
  assert.deepEqual(
    skill.files.map((file) => file.path),
    ["SKILL.md", DEMONSTRATION_PATH],
  );
  assert.deepEqual(getSkillMetadata(skill), {
    source: "demonstration",
    origin: "https://hr.test",
    recordedAt: "2026-10-19T12:00:00.000Z",
    status: "draft",
  });
  assert.match(getSkillBody(skill), /references\/demonstration\.json/);
  const demonstration = JSON.parse(skill.files[1].content);
  assert.equal(demonstration.steps.length, 4);
  assert.deepEqual(
    demonstration.inputs.map(
      (item: { label: string; sensitive: boolean }) =>
        `${item.label}:${item.sensitive}`,
    ),
    ["Email:false", "Password:true", "Project:false"],
  );
  assert.equal(demonstration.steps[0].id, undefined);
  assert.equal(demonstration.steps[1].field.sensitive, true);
});

test("a stored recorded skill reads back in the current reader", () => {
  const skill = buildRecordedSkill({
    session,
    draft: parseDraft(MODEL_REPLY),
    existingNames: [],
  });
  const [stored] = normalizeSkills(JSON.parse(JSON.stringify([skill])));
  assert.equal(stored.name, "submit-weekly-timesheet");
  assert.deepEqual(parseSkillFrontmatter(stored.files[0].content), {
    name: "submit-weekly-timesheet",
    description: skill.description,
  });
  assert.equal(stored.files[1].kind, "text");
  assert.ok(validateSkill(stored).every((check) => check.ok));
  assert.equal(recordedSkillInfo(stored)?.status, "draft");
  // The catalog lists it as the user's own skill.
  const [entry] = resolveSkillCatalog([stored], {}, []);
  assert.equal(entry.source, "user");
});

test("status moves from draft to verified only by marking it", () => {
  const skill = buildRecordedSkill({
    session,
    draft: parseDraft(MODEL_REPLY),
    existingNames: [],
  });
  assert.equal(recordedSkillInfo(skill)?.status, "draft");
  const verified = withRecordedStatus(skill, "verified");
  assert.equal(recordedSkillInfo(verified)?.status, "verified");
  assert.equal(getSkillBody(verified), getSkillBody(skill));
  // Edits keep the metadata: a rename in settings, a copy, a rewrite of
  // SKILL.md by the agent that leaves it out.
  const renamed = normalizeSkill({
    ...verified,
    files: replaceSkillEntryFile(verified, "new-name", "Changed", "Body"),
  });
  assert.equal(recordedSkillInfo(renamed)?.status, "verified");
  assert.equal(recordedSkillInfo(copySkill(verified))?.status, "verified");
  const rewritten = keepSkillMetadata(
    verified.files[0].content,
    '---\nname: "x"\ndescription: "y"\n---\n\nNew body',
  );
  assert.match(rewritten, /status: "verified"/);
  // An ordinary skill has no recording details.
  assert.equal(
    recordedSkillInfo(normalizeSkill({ name: "plain", description: "d" })),
    undefined,
  );
});

test("recorded skills start manual; automatic use is offered once verified", () => {
  const skill = buildRecordedSkill({
    session,
    draft: parseDraft(MODEL_REPLY),
    existingNames: [],
  });
  assert.equal(RECORDED_SKILL_INVOKE, "manual");
  const settings = setSkillInvokeMode({}, skill.id, RECORDED_SKILL_INVOKE);
  const invoke = skillInvokeMode(settings, skill.id);
  assert.equal(invoke, "manual");
  assert.equal(offersAutomaticUse(skill, invoke), false);
  const verified = withRecordedStatus(skill, "verified");
  assert.equal(offersAutomaticUse(verified, invoke), true);
  assert.equal(offersAutomaticUse(verified, "auto"), false);
});
