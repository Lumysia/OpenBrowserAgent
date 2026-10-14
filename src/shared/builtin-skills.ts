import { fillForm } from "./builtin-skill-texts/fill-form";
import { localExecutionBridgeSetup } from "./builtin-skill-texts/local-execution-bridge-setup";
import { openBrowserAgentHelp } from "./builtin-skill-texts/openbrowseragent-help";
import { skillCreator } from "./builtin-skill-texts/skill-creator";
import { tidyTabs } from "./builtin-skill-texts/tidy-tabs";
import { createSkillFile, skillFileKind } from "./skills";
import type { Skill } from "./types";

type BuiltinSkillText = {
  name: string;
  description: string;
  body: string;
  references?: Record<string, string>;
};

export const BUILTIN_SKILL_ID_PREFIX = "builtin-";

// Skills that ship with the extension. They are read from here every time
// (see skill-catalog), so a change reaches every profile with the update.
function builtinSkill({
  name,
  description,
  body,
  references = {},
}: BuiltinSkillText): Skill {
  return {
    id: `${BUILTIN_SKILL_ID_PREFIX}${name}`,
    name,
    description,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    files: [
      { ...createSkillFile(name, description, body, 0), encoding: "utf-8" },
      ...Object.entries(references).map(([path, content]) => ({
        path,
        kind: skillFileKind(path),
        encoding: "utf-8" as const,
        content,
        updatedAt: 0,
      })),
    ],
  };
}

export const BUILTIN_SKILLS: Skill[] = [
  fillForm,
  tidyTabs,
  openBrowserAgentHelp,
  skillCreator,
  localExecutionBridgeSetup,
].map(builtinSkill);
