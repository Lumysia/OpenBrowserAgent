import { formatDateTime } from "../../../src/shared/format";
import {
  formatCount,
  languageOf,
  type Messages,
} from "../../../src/shared/i18n";
import {
  idleReason,
  type RunContext,
} from "../../../src/shared/tasks/lifecycle";
import {
  TASK_PAUSE,
  type ScheduledTask,
  type TaskDevice,
  type TaskState,
  type TaskTrigger,
} from "../../../src/shared/tasks/types";

// How the task list describes a task: its schedule, its state, its last
// result. Dates and weekday names come from Intl in the UI language.

const WEEK_REFERENCE_SUNDAY = Date.UTC(2023, 0, 1);

export function weekdayName(language: string, day: number) {
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    timeZone: "UTC",
  }).format(WEEK_REFERENCE_SUNDAY + day * 86_400_000);
}

// "09:00" as the UI language writes a time.
function clockText(language: string, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return formatDateTime(language, new Date(2000, 0, 1, hours, minutes), {
    timeStyle: "short",
  });
}

function pageText(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url;
  }
}

export function scheduleText(t: Messages, trigger: TaskTrigger) {
  const language = languageOf(t);
  const s = t.tasks.schedule;
  switch (trigger.kind) {
    case "once":
      return s.once.replace("{time}", formatDateTime(language, trigger.at));
    case "interval":
      return s.every.replace(
        "{amount}",
        formatCount(t.tasks.units[trigger.unit], trigger.every),
      );
    case "daily":
      return s.daily.replace("{time}", clockText(language, trigger.time));
    case "weekly":
      return s.weekly
        .replace(
          "{days}",
          new Intl.ListFormat(language, { style: "narrow" }).format(
            trigger.days.map((day) => weekdayName(language, day)),
          ),
        )
        .replace("{time}", clockText(language, trigger.time));
    case "watch":
      return formatCount(s.watch, trigger.everyMinutes, {
        page: pageText(trigger.url),
      });
    case "unknown":
      return s.unknown;
  }
}

export type TaskStatus = {
  label: string;
  tone: "running" | "attention" | "paused" | "idle";
};

// What stops the task from running here, or that it runs now; undefined
// when it is simply scheduled.
export function taskStatus(
  t: Messages,
  task: ScheduledTask,
  state: TaskState,
  context: RunContext,
  devices: TaskDevice[],
): TaskStatus | undefined {
  const s = t.tasks.status;
  if (state.running) return { label: s.running, tone: "running" };
  const reason = idleReason(task, state, context);
  if (reason === "unsupported")
    return { label: s.unsupported, tone: "attention" };
  if (reason === TASK_PAUSE.needsUser)
    return { label: s.needsUser, tone: "attention" };
  if (reason === TASK_PAUSE.failures)
    return { label: s.pausedFailures, tone: "attention" };
  if (reason === "disabled") return { label: s.paused, tone: "paused" };
  if (reason === "allPaused") return { label: s.allPaused, tone: "paused" };
  if (reason === "otherDevice")
    return {
      label: s.otherDevice.replace(
        "{device}",
        devices.find((device) => device.id === task.deviceId)?.name ||
          task.deviceId.slice(0, 8),
      ),
      tone: "idle",
    };
  if (task.trigger.kind === "once" && state.lastRunAt !== undefined)
    return { label: s.done, tone: "idle" };
  return undefined;
}

// Whether the scheduler (not the user) paused it: "resume" clears that.
export function pausedByScheduler(state: TaskState) {
  return !!state.pausedBy;
}
