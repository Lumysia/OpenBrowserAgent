import type { TaskDraft } from "../../../src/shared/tasks/edit";
import {
  normalizeTrigger,
  watchableUrl,
} from "../../../src/shared/tasks/normalize";
import {
  TASK_LIMITS,
  isKnownTrigger,
  type IntervalUnit,
  type ScheduledTask,
  type TriggerKind,
} from "../../../src/shared/tasks/types";

// The task form's fields as text, and the task they make.

export type TaskForm = {
  title: string;
  prompt: string;
  kind: TriggerKind;
  // A local date and time as <input type="datetime-local"> writes it.
  at: string;
  every: string;
  unit: IntervalUnit;
  time: string;
  days: string[];
  url: string;
  selector: string;
  everyMinutes: string;
  agentId: string;
  deviceId: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateTime(value: number) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The start of the next hour: a sensible first "once" time.
function nextHour(now: number) {
  const date = new Date(now);
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date.getTime();
}

export function formFor(
  task: ScheduledTask | undefined,
  draft: Partial<TaskDraft> | undefined,
  defaults: { agentId: string; deviceId: string; url?: string; now: number },
): TaskForm {
  const source = task ?? draft;
  const trigger = source?.trigger;
  return {
    title: source?.title ?? "",
    prompt: source?.prompt ?? "",
    kind: trigger && isKnownTrigger(trigger) ? trigger.kind : "daily",
    at: localDateTime(
      trigger?.kind === "once" ? trigger.at : nextHour(defaults.now),
    ),
    every: String(trigger?.kind === "interval" ? trigger.every : 1),
    unit: trigger?.kind === "interval" ? trigger.unit : "hours",
    time:
      trigger?.kind === "daily" || trigger?.kind === "weekly"
        ? trigger.time
        : "09:00",
    days: (trigger?.kind === "weekly" ? trigger.days : [1]).map(String),
    url: trigger?.kind === "watch" ? trigger.url : (defaults.url ?? ""),
    selector: trigger?.kind === "watch" ? (trigger.selector ?? "") : "",
    everyMinutes: String(
      trigger?.kind === "watch"
        ? trigger.everyMinutes
        : TASK_LIMITS.defaultWatchMinutes,
    ),
    agentId: source?.agentId || defaults.agentId,
    deviceId: source?.deviceId || defaults.deviceId,
  };
}

export type FormError = "invalidPrompt" | "invalidUrl" | "invalidAt";

export function draftFromForm(
  form: TaskForm,
): { draft: TaskDraft } | { error: FormError } {
  const prompt = form.prompt.trim();
  if (!prompt) return { error: "invalidPrompt" };
  if (form.kind === "watch" && !watchableUrl(form.url))
    return { error: "invalidUrl" };
  const at = Date.parse(form.at);
  if (form.kind === "once" && !Number.isFinite(at))
    return { error: "invalidAt" };
  const trigger = normalizeTrigger({
    kind: form.kind,
    at,
    every: form.every,
    unit: form.unit,
    time: form.time,
    days: form.days.map(Number),
    url: form.url,
    selector: form.selector,
    everyMinutes: form.everyMinutes,
  });
  if (!trigger)
    return { error: form.kind === "watch" ? "invalidUrl" : "invalidAt" };
  return {
    draft: {
      title: form.title.trim() || prompt.replace(/\s+/g, " ").slice(0, 60),
      prompt,
      agentId: form.agentId,
      trigger,
      deviceId: form.deviceId,
    },
  };
}
