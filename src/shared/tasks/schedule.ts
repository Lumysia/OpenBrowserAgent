import type { TaskTrigger } from "./types";

const MINUTE_MS = 60_000;
const UNIT_MS = { minutes: MINUTE_MS, hours: 60 * MINUTE_MS } as const;
// Looking a week and a day ahead finds every weekly day.
const WEEK_SEARCH_DAYS = 8;

// Clock times are local: Date's local fields follow the time zone's rules,
// so a daily 09:00 stays 09:00 across a DST change. A time that does not
// exist that day (skipped by a spring change) runs at the first time that
// does; a repeated hour (autumn) runs once, at its first occurrence.

export function parseClockTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : undefined;
}

function atClock(day: Date, time: string) {
  const clock = parseClockTime(time) ?? { hours: 9, minutes: 0 };
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    clock.hours,
    clock.minutes,
  );
}

// The first time on `days` (all when empty) at `time` strictly after `after`.
function nextClockTime(after: number, time: string, days?: number[]) {
  const start = new Date(after);
  for (let offset = 0; offset < WEEK_SEARCH_DAYS; offset++) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
    );
    if (days?.length && !days.includes(day.getDay())) continue;
    const candidate = atClock(day, time).getTime();
    if (candidate > after) return candidate;
  }
  return undefined;
}

// When a task runs next. `from` is when it last ran, or when it was created
// or changed if it never ran since; `ran` says whether it ran. A time in the
// past means the run is due now: runs missed while the browser was closed
// make one run, not one per missed time, because the next one is counted
// from that run.
export function nextRunAt(
  trigger: TaskTrigger,
  { from, ran }: { from: number; ran: boolean },
): number | undefined {
  switch (trigger.kind) {
    case "once":
      return ran ? undefined : trigger.at;
    case "interval": {
      if (trigger.unit === "days") {
        const base = new Date(from);
        base.setDate(base.getDate() + trigger.every);
        return base.getTime();
      }
      return from + trigger.every * UNIT_MS[trigger.unit];
    }
    case "daily":
      return nextClockTime(from, trigger.time);
    case "weekly":
      return nextClockTime(from, trigger.time, trigger.days);
    case "watch":
      // A new watch reads its page at once to take a baseline.
      return ran ? from + trigger.everyMinutes * MINUTE_MS : from;
  }
}

export function isRecurring(trigger: TaskTrigger) {
  return trigger.kind !== "once";
}
