import { getBrowserApi } from "../../shared/browser-api";
import {
  resolveSkillCatalog,
  setSkillInvokeMode,
} from "../../shared/skill-catalog";
import { storage } from "../../shared/storage";
import { USER_ERROR_CODE, UserError } from "../../shared/user-errors";
import { sessionOfTab, teachSessions } from "../../shared/teach/records";
import {
  buildRecordedSkill,
  demonstrationOf,
  RECORDED_SKILL_INVOKE,
} from "../../shared/teach/skill-files";
import type { TeachSave, TeachSaved } from "../../shared/teach/messages";
import { TEACH_STATE, type TeachSession } from "../../shared/teach/types";
import type { Skill } from "../../shared/types";
import { waitTabComplete } from "../tools/tabs";
import { updateSession } from "./recorder";

// Saving a recording's draft as a skill (a draft until a check run passes,
// used only when picked), and the tab its check run works in.

export async function saveRecording({
  tabId,
  name,
  description,
  body,
}: TeachSave): Promise<TeachSaved> {
  const session = sessionOfTab(await teachSessions.get(), tabId);
  if (!session?.draft || session.state !== TEACH_STATE.review)
    throw new UserError(
      USER_ERROR_CODE.teachGone,
      "There is no recording to save.",
    );
  const [userSkills, settings] = await Promise.all([
    storage.skills.get(),
    storage.skillSettings.get(),
  ]);
  const redone = session.redo
    ? userSkills.find((skill) => skill.id === session.redo?.skillId)
    : undefined;
  const existingNames = resolveSkillCatalog(userSkills, settings)
    .filter((entry) => entry.skill.id !== redone?.id)
    .map((entry) => entry.skill.name);
  const skill = buildRecordedSkill({
    session,
    draft: { name, description, body },
    existingNames,
    ...(redone ? { id: redone.id } : {}),
  });
  const saved: Skill = redone
    ? { ...skill, createdAt: redone.createdAt }
    : skill;
  await storage.skills.update((skills) =>
    redone
      ? skills.map((item) => (item.id === saved.id ? saved : item))
      : [...skills, saved],
  );
  // A redone skill is a draft again: used only when picked.
  await storage.skillSettings.update((current) =>
    setSkillInvokeMode(current, saved.id, RECORDED_SKILL_INVOKE),
  );
  await updateSession(tabId, () => undefined);
  return { skillId: saved.id, name: saved.name };
}

// The steps of the skill's demonstration before `fromStep`, as the start
// of a new recording that redoes the rest.
export async function redoSteps(redo: NonNullable<TeachSession["redo"]>) {
  const skill = (await storage.skills.get()).find(
    (item) => item.id === redo.skillId,
  );
  const demonstration = skill ? demonstrationOf(skill) : undefined;
  return demonstration?.steps.slice(0, Math.max(0, redo.fromStep - 1)) || [];
}

// A new tab at the recording's start page (its site when the path has
// record ids), for the check run.
export async function openCheckTab(skillId: string) {
  const skill = (await storage.skills.get()).find(
    (item) => item.id === skillId,
  );
  const demonstration = skill ? demonstrationOf(skill) : undefined;
  if (!demonstration)
    throw new UserError(
      USER_ERROR_CODE.teachGone,
      "The skill has no recording.",
    );
  const start = demonstration.startUrl.includes("*")
    ? new URL(demonstration.startUrl.replaceAll("*", "x")).origin
    : demonstration.startUrl;
  const tab = await getBrowserApi().tabs.create({ url: start, active: true });
  if (tab.id === undefined)
    throw new UserError(
      USER_ERROR_CODE.teachCheckTab,
      "The tab could not be opened.",
    );
  await waitTabComplete(tab.id);
  return { tabId: tab.id, title: tab.title || "", url: start };
}
