import { DEFAULT_AGENT_ID } from "../agents";
import {
  clampInt,
  finiteNumber,
  isRecord,
  oneOf,
  trimmedString,
} from "../values";
import type { AgentActApprovals } from "./approval";
import { parseClockTime } from "./schedule";
import {
  INTERVAL_UNITS,
  TASK_LIMITS,
  TASK_PAUSE,
  TASK_RESULT,
  TRIGGER_FIELDS,
  TRIGGER_KINDS,
  UNKNOWN_TRIGGER,
  type KnownTrigger,
  type ScheduledTask,
  type TriggerKind,
  type TaskApproval,
  type TaskDevice,
  type TaskResultStatus,
  type TaskState,
  type TaskStates,
  type TaskTrigger,
} from "./types";

const DEFAULT_CLOCK_TIME = "09:00";

function clockTime(value: unknown) {
  const time = trimmedString(value);
  const clock = parseClockTime(time);
  return clock
    ? `${String(clock.hours).padStart(2, "0")}:${String(clock.minutes).padStart(2, "0")}`
    : DEFAULT_CLOCK_TIME;
}

// Only http(s) pages can be watched.
export function watchableUrl(value: unknown) {
  const text = trimmedString(value);
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

// A stored trigger in today's form, keeping fields a newer version added;
// undefined when it is unusable. A kind this version does not know reads
// as UNKNOWN_TRIGGER (kept, never run).
export function normalizeTrigger(value: unknown): TaskTrigger | undefined {
  if (!isRecord(value)) return undefined;
  const extra = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !(TRIGGER_FIELDS as readonly string[]).includes(key),
    ),
  );
  const kind = oneOf(TRIGGER_KINDS, value.kind, "once");
  if (value.kind !== kind) {
    // Read again (an update reads what it writes): stays as it was.
    const storedKind =
      value.kind === UNKNOWN_TRIGGER
        ? trimmedString(value.storedKind) || UNKNOWN_TRIGGER
        : trimmedString(value.kind);
    return storedKind
      ? { ...extra, kind: UNKNOWN_TRIGGER, storedKind }
      : undefined;
  }
  const known = knownTrigger(kind, value);
  return known && ({ ...extra, ...known } as TaskTrigger);
}

function knownTrigger(
  kind: TriggerKind,
  value: Record<string, unknown>,
): KnownTrigger | undefined {
  const count = (fallback: number, min: number) =>
    clampInt(value.every, {
      fallback,
      min,
      max: TASK_LIMITS.maxIntervalCount,
    });
  switch (kind) {
    case "once": {
      const at = finiteNumber(value.at);
      return at === undefined ? undefined : { kind, at };
    }
    case "interval": {
      const unit = oneOf(INTERVAL_UNITS, value.unit, "hours");
      // Time tasks follow the watch minimum too: at most once a minute.
      return { kind, unit, every: count(1, 1) };
    }
    case "daily":
      return { kind, time: clockTime(value.time) };
    case "weekly": {
      const days = Array.isArray(value.days)
        ? [
            ...new Set(
              value.days
                .map(Number)
                .filter((day) => Number.isInteger(day) && day >= 0 && day < 7),
            ),
          ].sort()
        : [];
      return {
        kind,
        time: clockTime(value.time),
        days: days.length ? days : [1],
      };
    }
    case "watch": {
      const url = watchableUrl(value.url);
      if (!url) return undefined;
      const selector = trimmedString(value.selector);
      return {
        kind,
        url,
        ...(selector ? { selector } : {}),
        everyMinutes: clampInt(value.everyMinutes, {
          fallback: TASK_LIMITS.defaultWatchMinutes,
          min: TASK_LIMITS.minWatchMinutes,
          max: 24 * 60,
        }),
      };
    }
  }
}

// A stored task in today's form, or undefined when it cannot be one (no
// id or no usable trigger). Reading never invents a time.
export function normalizeTask(value: unknown): ScheduledTask | undefined {
  if (!isRecord(value)) return undefined;
  const id = trimmedString(value.id);
  const trigger = normalizeTrigger(value.trigger);
  if (!id || !trigger) return undefined;
  const createdAt = finiteNumber(value.createdAt, 0);
  return {
    ...(value as Partial<ScheduledTask>),
    id,
    title: trimmedString(value.title).slice(0, TASK_LIMITS.titleChars),
    prompt: trimmedString(value.prompt).slice(0, TASK_LIMITS.promptChars),
    agentId: trimmedString(value.agentId) || DEFAULT_AGENT_ID,
    trigger,
    deviceId: trimmedString(value.deviceId),
    enabled: value.enabled !== false,
    createdAt,
    updatedAt: finiteNumber(value.updatedAt, createdAt),
  };
}

export function normalizeTasks(value: unknown): ScheduledTask[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const task = normalizeTask(item);
    if (!task || seen.has(task.id)) return [];
    seen.add(task.id);
    return [task];
  });
}

export function normalizeTaskDevices(value: unknown): TaskDevice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = trimmedString(item.id);
    if (!id) return [];
    return [
      {
        ...(item as Partial<TaskDevice>),
        id,
        name: trimmedString(item.name) || id.slice(0, 8),
        seenAt: finiteNumber(item.seenAt, 0),
      },
    ];
  });
}

const RESULT_STATUSES = Object.values(TASK_RESULT);
const PAUSES = Object.values(TASK_PAUSE);

function normalizeState(value: unknown): TaskState {
  const item = isRecord(value) ? value : {};
  const running = isRecord(item.running) ? item.running : undefined;
  const result = isRecord(item.lastResult) ? item.lastResult : undefined;
  const baseline = isRecord(item.baseline) ? item.baseline : undefined;
  return {
    nextRunAt: finiteNumber(item.nextRunAt),
    lastRunAt: finiteNumber(item.lastRunAt),
    running: running
      ? {
          chatId: trimmedString(running.chatId) || undefined,
          startedAt: finiteNumber(running.startedAt, 0),
          attempt: clampInt(running.attempt, { fallback: 1, min: 1 }),
        }
      : undefined,
    lastResult:
      result && RESULT_STATUSES.includes(result.status as never)
        ? {
            status: result.status as TaskResultStatus,
            at: finiteNumber(result.at, 0),
            chatId: trimmedString(result.chatId) || undefined,
            summary: trimmedString(result.summary) || undefined,
          }
        : undefined,
    retrying: item.retrying === true || undefined,
    unseen: item.unseen === true || undefined,
    failures: clampInt(item.failures, { fallback: 0, min: 0 }),
    pausedBy: PAUSES.includes(item.pausedBy as never)
      ? (item.pausedBy as TaskState["pausedBy"])
      : undefined,
    baseline:
      baseline && typeof baseline.hash === "string"
        ? {
            hash: baseline.hash,
            text: String(baseline.text ?? "").slice(
              0,
              TASK_LIMITS.baselineChars,
            ),
            ...(typeof baseline.tail === "string"
              ? { tail: baseline.tail.slice(-TASK_LIMITS.baselineChars) }
              : {}),
            ...(typeof baseline.lines === "string"
              ? { lines: baseline.lines }
              : {}),
            at: finiteNumber(baseline.at, 0),
          }
        : undefined,
    conditionMet: item.conditionMet === true || undefined,
    approved: normalizeApproval(item.approved),
    okNotified: trimmedString(item.okNotified) || undefined,
    tabId: finiteNumber(item.tabId),
  };
}

function normalizeApproval(value: unknown): TaskApproval | undefined {
  if (!isRecord(value)) return undefined;
  const trigger = normalizeTrigger(value.trigger);
  if (!trigger || typeof value.prompt !== "string") return undefined;
  return {
    prompt: value.prompt,
    trigger,
    agentId: trimmedString(value.agentId),
    enabled: value.enabled === true,
    at: finiteNumber(value.at, 0),
  };
}

export function normalizeAgentActApprovals(value: unknown): AgentActApprovals {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, approval]) =>
      isRecord(approval) && Array.isArray(approval.toolGroups)
        ? [[id, { toolGroups: approval.toolGroups.map(String) }]]
        : [],
    ),
  );
}

export function normalizeTaskStates(value: unknown): TaskStates {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([id, state]) => [id, normalizeState(state)]),
  );
}

export function taskState(states: TaskStates, id: string): TaskState {
  return states[id] ?? { failures: 0 };
}
