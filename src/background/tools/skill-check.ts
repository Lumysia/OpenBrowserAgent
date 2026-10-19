import { storage, updateById } from "../../shared/storage";
import { skillChecks } from "../../shared/teach/records";
import {
  RECORDED_SKILL_STATUS,
  recordedSkillInfo,
  withRecordedStatus,
} from "../../shared/teach/skill-files";
import { TOOL_NAME } from "../../shared/tool-names";
import { trimmedString } from "../../shared/values";
import { fail, ok, schema, type ToolDefinition } from "./types";

const SUMMARY_CHARS = 300;

// Only in the check run of a recorded skill (see shared/teach/check.ts):
// how the run went. A pass marks the skill verified; the side panel then
// offers automatic use, or after a mismatch the ways to fix it.
export const skillCheckTool: ToolDefinition = {
  name: TOOL_NAME.skillCheck,
  effects: "act",
  available: (setup) => !!setup.skillCheck,
  summary: "Report how the check run of a recorded skill went",
  description:
    "Report once, before your final answer, whether the recorded skill worked as written in this check run. passed: true only when you did every step and its check holds. Otherwise passed: false with divergedAt (the number of the skill's step where the page or the result differed from the skill) and summary: one sentence on what happened there. Also report passed: false when the user stopped you.",
  parameters: schema(
    {
      passed: { type: "boolean" },
      divergedAt: { type: "number" },
      summary: { type: "string" },
    },
    ["passed", "summary"],
  ),
  async execute(input, { run }) {
    const skillId = run.skillCheck?.skillId;
    if (!skillId) return fail("This is not a check run.");
    if (typeof input.passed !== "boolean") return fail("passed is required.");
    const passed = input.passed;
    const step = Number(input.divergedAt);
    const divergedAt =
      !passed && Number.isInteger(step) && step > 0 ? step : undefined;
    const summary = trimmedString(input.summary).slice(0, SUMMARY_CHARS);
    if (passed) {
      const updated = await updateById(storage.skills, skillId, (skill) =>
        recordedSkillInfo(skill)
          ? withRecordedStatus(skill, RECORDED_SKILL_STATUS.verified)
          : skill,
      );
      if (!updated) return fail("The skill was deleted meanwhile.");
    }
    await skillChecks.update((checks) => ({
      ...checks,
      [run.chatId]: {
        skillId,
        passed,
        ...(divergedAt ? { divergedAt } : {}),
        summary,
        at: Date.now(),
      },
    }));
    return ok(
      passed
        ? "Recorded: the skill is verified. Now tell the user briefly."
        : "Recorded. Now tell the user briefly where it went differently.",
      { passed, divergedAt, summary },
    );
  },
};
