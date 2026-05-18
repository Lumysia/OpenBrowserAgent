import { OPTIONS_HASH, QUICK_FEEDBACK_MS } from "../../src/shared/config";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { Chat, Skill } from "../../src/shared/types";
import { requestSkill } from "./ai-requests";

export function createSkillFromChat({
  currentChat,
  creatingSkill,
  modelId,
  setCreatingSkill,
  setSkillCreated,
  setSkills,
}: {
  currentChat?: Chat;
  creatingSkill: boolean;
  modelId?: string;
  setCreatingSkill: (value: boolean) => void;
  setSkillCreated: (value: boolean) => void;
  setSkills: (updater: (items: Skill[]) => Skill[]) => void;
}) {
  if (creatingSkill) return;
  if (!currentChat?.messages.length) {
    openOrFocusOptions(OPTIONS_HASH.skills).catch(console.warn);
    return;
  }
  setCreatingSkill(true);
  setSkillCreated(false);
  requestSkill({
    modelId,
    messages: currentChat.messages,
    onSuccess: (skill) => {
      setSkills((items) => [...items, skill]);
      setCreatingSkill(false);
      setSkillCreated(true);
      window.setTimeout(() => setSkillCreated(false), QUICK_FEEDBACK_MS);
    },
    onError: (error) => {
      if (error) console.warn("Failed to create skill", error);
      setCreatingSkill(false);
    },
  });
}
