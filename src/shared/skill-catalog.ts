import { BUILTIN_SKILLS } from "./builtin-skills";
import { SKILL_DESCRIPTION_MAX_CHARS, SKILL_LISTING_MAX_CHARS } from "./config";
import { copySkill, normalizeSkillName } from "./skills";
import type { Skill, SkillInvokeMode, SkillSettings } from "./types";

export const SKILL_INVOKE_MODES: SkillInvokeMode[] = ["auto", "manual", "off"];
const DEFAULT_SKILL_INVOKE_MODE: SkillInvokeMode = "auto";

// builtin: shipped in the code; override: the user's copy of a built-in
// (same name), which replaces it until deleted; user: the user's own.
type SkillSource = "builtin" | "override" | "user";

export type SkillEntry = {
  skill: Skill;
  source: SkillSource;
  invoke: SkillInvokeMode;
};

// Built-ins are read from the code every time, so every change to them
// reaches existing profiles; storage holds only the user's skills and the
// per-skill settings.
export function resolveSkillCatalog(
  userSkills: Skill[],
  settings: SkillSettings,
  builtins: Skill[] = BUILTIN_SKILLS,
): SkillEntry[] {
  const userByName = new Map(
    userSkills.map((skill) => [normalizeSkillName(skill.name), skill]),
  );
  const builtinNames = new Set(
    builtins.map((skill) => normalizeSkillName(skill.name)),
  );
  const entry = (skill: Skill, source: SkillSource): SkillEntry => ({
    skill,
    source,
    invoke: skillInvokeMode(settings, skill.id),
  });
  return [
    ...builtins.map((builtin) => {
      const override = userByName.get(normalizeSkillName(builtin.name));
      return override ? entry(override, "override") : entry(builtin, "builtin");
    }),
    ...userSkills
      .filter((skill) => !builtinNames.has(normalizeSkillName(skill.name)))
      .map((skill) => entry(skill, "user")),
  ];
}

export function skillInvokeMode(
  settings: SkillSettings,
  id: string,
): SkillInvokeMode {
  return settings[id]?.invoke || DEFAULT_SKILL_INVOKE_MODE;
}

export function normalizeSkillSettings(value: unknown): SkillSettings {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([id, item]) => {
      const invoke = (item as { invoke?: unknown } | null)?.invoke;
      return SKILL_INVOKE_MODES.includes(invoke as SkillInvokeMode)
        ? [[id, { invoke: invoke as SkillInvokeMode }]]
        : [];
    }),
  );
}

export function setSkillInvokeMode(
  settings: SkillSettings,
  id: string,
  invoke: SkillInvokeMode,
): SkillSettings {
  const next = { ...settings };
  if (invoke === DEFAULT_SKILL_INVOKE_MODE) delete next[id];
  else next[id] = { invoke };
  return next;
}

// Skills a run can use: auto ones are listed in the prompt, manual ones are
// read only when the user picks them.
export function availableSkills(entries: SkillEntry[]) {
  return entries
    .filter((entry) => entry.invoke !== "off")
    .map((entry) => entry.skill);
}

export function listedSkills(entries: SkillEntry[]) {
  return entries
    .filter((entry) => entry.invoke === "auto")
    .map((entry) => entry.skill);
}

export function findSkill(skills: Skill[], nameOrId: string) {
  const wanted = normalizeSkillName(nameOrId);
  return skills.find(
    (skill) =>
      skill.id === nameOrId || normalizeSkillName(skill.name) === wanted,
  );
}

// The user's editable copy of a built-in; it overrides the built-in until
// deleted and takes over its invoke mode (see inheritSkillSettings).
export function customizeBuiltinSkill(builtin: Skill) {
  return copySkill(builtin);
}

export function inheritSkillSettings(
  settings: SkillSettings,
  fromId: string,
  toId: string,
) {
  return setSkillInvokeMode(settings, toId, skillInvokeMode(settings, fromId));
}

export function forgetSkillSettings(settings: SkillSettings, id: string) {
  if (!settings[id]) return settings;
  const next = { ...settings };
  delete next[id];
  return next;
}

export function skillListingLine(skill: Skill) {
  const description = skill.description.replace(/\s+/g, " ").trim();
  return `- ${skill.name}: ${
    description.length > SKILL_DESCRIPTION_MAX_CHARS
      ? `${description.slice(0, SKILL_DESCRIPTION_MAX_CHARS - 1).trimEnd()}…`
      : description
  }`;
}

export function skillListingSize(skills: Skill[]) {
  const chars = skills.map(skillListingLine).join("\n").length;
  return { chars, overBudget: chars > SKILL_LISTING_MAX_CHARS };
}
