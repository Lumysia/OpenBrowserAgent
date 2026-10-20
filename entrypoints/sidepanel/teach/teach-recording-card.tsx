import { Lock, Shuffle, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatCount } from "../../../src/shared/i18n";
import { TEACH_MESSAGE } from "../../../src/shared/teach/messages";
import {
  TEACH_LIMITS,
  TEACH_STEP_KIND,
  type TeachSession,
  type TeachStep,
} from "../../../src/shared/teach/types";
import { Button, Feedback, IconTooltip } from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import { cn } from "../../../src/ui/utils";
import { teachStepText } from "./step-text";
import type { TeachController } from "./use-teach";

// The recording while it records: the steps so far, newest last, each
// with "changes each time", "keep as an example" (fields that are not
// secret, while the page still has the value) and delete.
export function TeachRecordingCard({
  session,
  teach,
}: {
  session: TeachSession;
  teach: TeachController;
}) {
  const t = useMessages();
  const words = t.teach.recording;
  const count = session.steps.length;
  return (
    <div
      className="composer-card teach-card"
      role="region"
      aria-label={words.title}
    >
      <div className="composer-card-header">
        <strong>
          <span className="teach-recording-dot" aria-hidden="true" />
          {words.title}
          <span className="teach-count">{formatCount(words.steps, count)}</span>
        </strong>
        {!count && <small>{words.empty}</small>}
      </div>
      {!!count && (
        <ol className="teach-steps" aria-live="polite">
          {session.steps.map((step) => (
            <TeachStepRow
              key={step.id}
              step={step}
              tabId={session.tabId}
              teach={teach}
            />
          ))}
        </ol>
      )}
      {!!session.unrecorded?.input && (
        <Feedback error>
          {formatCount(words.unrecorded, session.unrecorded.input)}
        </Feedback>
      )}
      {!!session.unrecorded?.frames && (
        <Feedback>
          {formatCount(words.frames, session.unrecorded.frames)}
        </Feedback>
      )}
      {session.dropped > 0 ? (
        <Feedback error>{words.full}</Feedback>
      ) : (
        count >= TEACH_LIMITS.warnSteps && <Feedback>{words.long}</Feedback>
      )}
      {teach.error && <Feedback error>{teach.error}</Feedback>}
      <div className="composer-card-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            teach.message({ type: TEACH_MESSAGE.discard, tabId: session.tabId })
          }
        >
          {words.discard}
        </Button>
        <Button size="sm" onClick={() => teach.stop(session.tabId)}>
          {words.stop}
        </Button>
      </div>
    </div>
  );
}

function TeachStepRow({
  step,
  tabId,
  teach,
}: {
  step: TeachStep;
  tabId: number;
  teach: TeachController;
}) {
  const t = useMessages();
  const words = t.teach.recording;
  const [gone, setGone] = useState(false);
  const field = step.kind === TEACH_STEP_KIND.field ? step.field : undefined;
  const ref = { tabId, stepId: step.id };
  const keepExample = async () => {
    const keep = !field?.example;
    setGone(!(await teach.keepExample(tabId, step.id, keep)));
  };
  return (
    <li className="teach-step">
      <span className="teach-step-text">
        {teachStepText(step, t)}
        {field?.secret && (
          <span className="teach-step-note">
            <Lock size={12} aria-hidden="true" />
            {words.secret}
          </span>
        )}
        {field?.example && (
          <span className="teach-step-note">{words.exampleKept}</span>
        )}
        {gone && !field?.example && !field?.secret && (
          <span className="teach-step-note">{words.exampleGone}</span>
        )}
      </span>
      <span className="teach-step-actions">
        <IconTooltip label={words.varies}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={words.varies}
            aria-pressed={!!step.varies}
            className={cn(step.varies && "teach-step-toggled")}
            onClick={() =>
              teach.message({
                type: TEACH_MESSAGE.markVaries,
                varies: !step.varies,
                ...ref,
              })
            }
          >
            <Shuffle size={14} />
          </Button>
        </IconTooltip>
        {field && !field.secret && (
          <IconTooltip
            label={field.example ? words.dropExample : words.keepExample}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label={field.example ? words.dropExample : words.keepExample}
              aria-pressed={!!field.example}
              className={cn(field.example && "teach-step-toggled")}
              onClick={() => void keepExample()}
            >
              <StickyNote size={14} />
            </Button>
          </IconTooltip>
        )}
        <IconTooltip label={words.deleteStep}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={words.deleteStep}
            onClick={() =>
              teach.message({ type: TEACH_MESSAGE.deleteStep, ...ref })
            }
          >
            <Trash2 size={14} />
          </Button>
        </IconTooltip>
      </span>
    </li>
  );
}
