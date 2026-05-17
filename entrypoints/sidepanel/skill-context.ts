import { getSkillInstruction, normalizeSkill } from "../../src/shared/skills";
import type { Skill } from "../../src/shared/types";

export function interpolateSkillPackage(
  skill: Skill,
  interpolate: (value: string) => string,
) {
  const normalized = normalizeSkill(skill);
  return {
    ...normalized,
    files: normalized.files.map((file) =>
      file.path === "SKILL.md"
        ? { ...file, content: interpolate(getSkillInstruction(normalized)) }
        : file,
    ),
  };
}
