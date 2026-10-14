import { CircleAlert, CircleStop, Play, Scissors } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { RUN_STOP_REASON, type replyCutOff } from "../../src/shared/run-stop";
import { Button, Feedback } from "../../src/ui/components";

const ICONS = {
  [RUN_STOP_REASON.length]: Scissors,
  [RUN_STOP_REASON.aborted]: CircleStop,
  [RUN_STOP_REASON.error]: CircleAlert,
};

// The one line under a response that ended early: why, and (on the chat's
// latest response) a way to have the model go on.
export function RunStopNotice({
  t,
  cut,
  onContinue,
}: {
  t: Messages;
  cut: NonNullable<ReturnType<typeof replyCutOff>>;
  onContinue?: () => void;
}) {
  const labels = t.sidepanel.runStop;
  const error = cut.reason === RUN_STOP_REASON.error;
  const text = error
    ? cut.errors.join("\n") || labels.error
    : cut.reason === RUN_STOP_REASON.length
      ? labels.length
      : labels.aborted;
  const Icon = ICONS[cut.reason];
  return (
    <div className={`run-stop-notice${error ? " error" : ""}`}>
      <Icon aria-hidden />
      <Feedback error={error} className="run-stop-notice-text">
        {text}
      </Feedback>
      {onContinue && (
        <Button variant="outline" size="sm" onClick={onContinue}>
          <Play size={14} aria-hidden />
          {labels.continue}
        </Button>
      )}
    </div>
  );
}
