import { useEffect } from "react";
import { mergeBuiltinSkills } from "../shared/builtin-skills";
import type { Skill } from "../shared/types";

export function useBuiltinSkills(
  skills: Skill[] | undefined,
  setSkills: (value: Skill[]) => void,
) {
  useEffect(() => {
    if (!skills) return;
    const next = mergeBuiltinSkills(skills);
    if (next !== skills) setSkills(next);
  }, [skills, setSkills]);
}
