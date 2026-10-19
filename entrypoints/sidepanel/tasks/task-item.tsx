import { Pause, Pencil, Play, Trash2, Zap } from "lucide-react";
import type { RunContext } from "../../../src/shared/tasks/lifecycle";
import {
  TASK_RESULT,
  isKnownTrigger,
  type ScheduledTask,
  type TaskDevice,
  type TaskState,
} from "../../../src/shared/tasks/types";
import { formatDateTime } from "../../../src/shared/format";
import {
  Badge,
  Button,
  ConfirmIconButton,
  IconTooltip,
} from "../../../src/ui/components";
import { useLocale, useMessages } from "../../../src/ui/messages";
import { cn } from "../../../src/ui/utils";
import { formatRelativeTime } from "../format";
import { scheduleText, taskStatus } from "./task-display";

// One task in the list: its title, schedule and state, its last result
// (opening its chat) and next run, and its actions.
export function TaskItem({
  task,
  state,
  context,
  devices,
  onOpenChat,
  onEdit,
  onRunNow,
  onSetPaused,
  onDelete,
}: {
  task: ScheduledTask;
  state: TaskState;
  context: RunContext;
  devices: TaskDevice[];
  onOpenChat: (chatId: string) => void;
  onEdit: () => void;
  onRunNow: () => void;
  onSetPaused: (paused: boolean) => void;
  onDelete: () => void;
}) {
  const t = useMessages();
  const locale = useLocale();
  const status = taskStatus(t, task, state, context, devices);
  const result = state.lastResult;
  const paused = !task.enabled || !!state.pausedBy;
  const mine = task.deviceId === context.deviceId;
  // A schedule from a newer version: kept and shown, not run or edited.
  const known = isKnownTrigger(task.trigger);
  const chatId = state.running?.chatId || result?.chatId;
  const resultLine = result
    ? `${t.tasks.results[result.status]} · ${formatRelativeTime(t, result.at)}${
        result.summary && result.status !== TASK_RESULT.unchanged
          ? ` — ${result.summary}`
          : ""
      }`
    : "";
  const nextLine =
    !status && state.nextRunAt !== undefined
      ? t.tasks.nextRun.replace(
          "{time}",
          formatDateTime(locale, Math.max(state.nextRunAt, Date.now())),
        )
      : "";
  return (
    <div
      className={cn(
        "history-item",
        "multiline",
        "task-item",
        state.unseen && "unread-complete",
      )}
      data-task-id={task.id}
    >
      <Button
        variant="ghost"
        className="history-select"
        disabled={!chatId && !known}
        onClick={() => (chatId ? onOpenChat(chatId) : onEdit())}
      >
        <span className="history-title-row">
          {state.unseen && (
            <span className="history-unread-dot" aria-hidden="true" />
          )}
          {status && (
            <Badge className="task-status" data-tone={status.tone}>
              {status.label}
            </Badge>
          )}
          <strong>{task.title || t.tasks.untitled}</strong>
        </span>
        <small>{scheduleText(t, task.trigger)}</small>
        {resultLine && <small className="task-result">{resultLine}</small>}
        {nextLine && <small>{nextLine}</small>}
      </Button>
      <div className="history-item-actions">
        <IconTooltip label={t.tasks.actions.runNow}>
          <Button
            variant="ghost"
            size="icon"
            className="history-item-action"
            aria-label={t.tasks.actions.runNow}
            disabled={!mine || !known || !!state.running}
            onClick={onRunNow}
          >
            <Zap size={13} />
          </Button>
        </IconTooltip>
        <IconTooltip
          label={paused ? t.tasks.actions.resume : t.tasks.actions.pause}
        >
          <Button
            variant="ghost"
            size="icon"
            className="history-item-action"
            aria-label={paused ? t.tasks.actions.resume : t.tasks.actions.pause}
            aria-pressed={paused}
            onClick={() => onSetPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </Button>
        </IconTooltip>
        <IconTooltip label={t.tasks.actions.edit}>
          <Button
            variant="ghost"
            size="icon"
            className="history-item-action"
            aria-label={t.tasks.actions.edit}
            disabled={!known}
            onClick={onEdit}
          >
            <Pencil size={13} />
          </Button>
        </IconTooltip>
        <ConfirmIconButton
          icon={<Trash2 size={13} />}
          label={t.tasks.actions.delete}
          question={t.tasks.actions.deleteConfirm}
          confirmLabel={t.common.delete}
          cancelLabel={t.common.cancel}
          className="history-item-action history-delete-action"
          onConfirm={onDelete}
        />
      </div>
    </div>
  );
}
