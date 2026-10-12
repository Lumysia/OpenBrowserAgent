import { useMemo } from "react";
import { resolveSkillCatalog } from "../shared/skill-catalog";
import { storage } from "../shared/storage";
import { useStoredState } from "./useStoredState";

// The skills a user has: built-ins from the code, the user's own and their
// copies of built-ins, with each skill's invoke mode.
export function useSkillCatalog() {
  const [skills, setSkills] = useStoredState(storage.skills);
  const [settings, setSettings] = useStoredState(storage.skillSettings);
  const entries = useMemo(
    () =>
      skills && settings ? resolveSkillCatalog(skills, settings) : undefined,
    [skills, settings],
  );
  return { entries, skills, setSkills, settings, setSettings };
}
