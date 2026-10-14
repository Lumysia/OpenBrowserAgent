import { BUILTIN_SKILL_ID_PREFIX } from "../shared/builtin-skills";
import type { Messages } from "../shared/i18n";
import type { PickedSkill } from "../shared/types";

// The name and description a person sees for a skill. Built-in skills show
// them in the UI language; the text sent to the model stays as it is.
export function skillDisplay(skill: PickedSkill, t: Messages) {
  const texts: Record<string, { name: string; description: string }> =
    t.display.builtinSkills;
  const key = skill.id.startsWith(BUILTIN_SKILL_ID_PREFIX)
    ? skill.id.slice(BUILTIN_SKILL_ID_PREFIX.length)
    : "";
  const builtin = Object.hasOwn(texts, key) ? texts[key] : undefined;
  return {
    name: builtin?.name || skill.name || t.options.untitledSkill,
    description: builtin?.description ?? skill.description,
  };
}
