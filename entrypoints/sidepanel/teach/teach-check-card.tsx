import { CircleAlert, CircleCheckBig } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveSkillCatalog } from "../../../src/shared/skill-catalog";
import { storage } from "../../../src/shared/storage";
import { offersAutomaticUse } from "../../../src/shared/teach/skill-files";
import type { SkillCheckResult } from "../../../src/shared/teach/records";
import { formatMessage } from "../../../src/shared/text";
import { Button, Feedback } from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import type { TeachController } from "./use-teach";

type CheckEntry = SkillCheckResult & { chatId: string };

// How the check run of a recorded skill came out, in its chat: a pass
// offers automatic use; a mismatch offers to fix the steps, record again
// from that step, or keep the draft.
export function TeachCheckCard({
  check,
  teach,
  disabled,
}: {
  check: CheckEntry;
  teach: TeachController;
  disabled: boolean;
}) {
  const t = useMessages();
  const words = t.teach.check;
  const skill = useRecordedSkill(check.skillId);
  const name = skill?.name || "";
  const done = (
    <Button size="sm" onClick={() => teach.dismissCheck(check.chatId)}>
      {words.done}
    </Button>
  );
  if (check.passed)
    return (
      <div className="composer-card teach-card" role="status">
        <div className="composer-card-header">
          <strong>
            <CircleCheckBig size={15} aria-hidden="true" />
            {formatMessage(words.passed, { name })}
          </strong>
          {skill && !skill.offersAuto && skill.invoke === "auto" && (
            <small>{formatMessage(words.autoOn, { name })}</small>
          )}
        </div>
        {teach.error && <Feedback error>{teach.error}</Feedback>}
        <div className="composer-card-actions">
          {skill?.offersAuto && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => teach.allowAutomatic(check.skillId)}
            >
              {words.auto}
            </Button>
          )}
          {done}
        </div>
      </div>
    );
  return (
    <div className="composer-card teach-card" role="status">
      <div className="composer-card-header">
        <strong>
          <CircleAlert size={15} aria-hidden="true" />
          {check.divergedAt
            ? formatMessage(words.diverged, { step: check.divergedAt })
            : words.divergedNoStep}
        </strong>
        {check.summary && <small>{check.summary}</small>}
      </div>
      {teach.error && <Feedback error>{teach.error}</Feedback>}
      <div className="composer-card-actions">
        {teach.fixing ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !skill}
            onClick={() => teach.startCheck(check.skillId, name)}
          >
            {t.teach.save.check}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => teach.dismissCheck(check.chatId)}
            >
              {words.keepDraft}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => teach.recordAgain(check.chatId, check)}
            >
              {words.recordAgain}
            </Button>
            <Button
              size="sm"
              disabled={disabled || !skill}
              onClick={() => teach.fixSteps(check.chatId, check, name)}
            >
              {words.fix}
            </Button>
          </>
        )}
        {teach.fixing && done}
      </div>
    </div>
  );
}

// The checked skill as stored now, with its invoke mode.
function useRecordedSkill(skillId: string) {
  const [skill, setSkill] = useState<{
    name: string;
    invoke: string;
    offersAuto: boolean;
  }>();
  useEffect(() => {
    const read = async () => {
      const [skills, settings] = await Promise.all([
        storage.skills.get(),
        storage.skillSettings.get(),
      ]);
      const entry = resolveSkillCatalog(skills, settings).find(
        (item) => item.skill.id === skillId,
      );
      setSkill(
        entry && {
          name: entry.skill.name,
          invoke: entry.invoke,
          offersAuto: offersAutomaticUse(entry.skill, entry.invoke),
        },
      );
    };
    void read();
    const stopSkills = storage.skills.watch(() => void read());
    const stopSettings = storage.skillSettings.watch(() => void read());
    return () => {
      stopSkills();
      stopSettings();
    };
  }, [skillId]);
  return skill;
}
