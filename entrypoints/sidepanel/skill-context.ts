import {
  interpolateSkillVariables,
  normalizeSkillName,
  toPickedSkill,
} from "../../src/shared/skills";
import type { PickedSkill } from "../../src/shared/types";

export function toggleSkill(skills: PickedSkill[], skill: PickedSkill) {
  return skills.some((item) => item.id === skill.id)
    ? skills.filter((item) => item.id !== skill.id)
    : [...skills, toPickedSkill(skill)];
}

export function addSkill(skills: PickedSkill[], skill: PickedSkill) {
  return skills.some((item) => item.id === skill.id)
    ? skills
    : [...skills, toPickedSkill(skill)];
}

// While the composer holds only "/" and a partial name, the slash picker
// filters skills by it.
export function slashSkillQuery(input: string) {
  return input.match(/^\/([^\s/]*)$/)?.[1];
}

export function filterSkills<T extends PickedSkill>(
  skills: T[],
  query: string,
) {
  const wanted = query.toLowerCase();
  if (!wanted) return skills;
  const rank = (skill: T) => {
    const name = skill.name.toLowerCase();
    if (name.startsWith(wanted)) return 0;
    if (name.includes(wanted)) return 1;
    return skill.description.toLowerCase().includes(wanted) ? 2 : -1;
  };
  return skills
    .map((skill) => ({ skill, rank: rank(skill) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.skill);
}

// "/name request" typed out in full: the named skill is picked and the rest
// is the request.
export function takeSlashSkill<T extends PickedSkill>(
  input: string,
  skills: T[],
) {
  const match = input.match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/);
  if (!match) return undefined;
  const name = normalizeSkillName(match[1]);
  const skill = skills.find((item) => normalizeSkillName(item.name) === name);
  return skill ? { skill, rest: (match[2] || "").trim() } : undefined;
}

// The text a send carries. A typed message can pick a skill with "/name
// request"; a resend keeps its picks; a context menu or smart bar request is
// sent exactly as built.
export function messageToSend<T extends PickedSkill>(
  content: string,
  skills: T[],
  source: "typed" | "resend" | "request",
) {
  const trimmed = content.trim();
  if (source === "request") return { slash: undefined, text: trimmed };
  const slash =
    source === "typed" ? takeSlashSkill(trimmed, skills) : undefined;
  return { slash, text: interpolateSkillVariables(slash?.rest ?? trimmed) };
}
