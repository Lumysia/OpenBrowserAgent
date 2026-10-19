// Clock times are local: run in a zone with DST changes.
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import test from "node:test";
import { nextRunAt, parseClockTime } from "../src/shared/tasks/schedule";
import { plannedRunAt } from "../src/shared/tasks/lifecycle";
import type { ScheduledTask, TaskTrigger } from "../src/shared/tasks/types";

const local = (...parts: [number, number, number, number?, number?]) =>
  new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3] ?? 0,
    parts[4] ?? 0,
  ).getTime();
const MINUTE = 60_000;

test("the test runs in a zone with DST", () => {
  // 2026-03-08 has 23 hours in New York.
  assert.equal(local(2026, 3, 9) - local(2026, 3, 8), 23 * 60 * MINUTE);
});

test("intervals count from the last run; days keep the clock time", () => {
  const from = local(2026, 3, 7, 10, 30);
  assert.equal(
    nextRunAt(
      { kind: "interval", every: 15, unit: "minutes" },
      { from, ran: true },
    ),
    from + 15 * MINUTE,
  );
  assert.equal(
    nextRunAt(
      { kind: "interval", every: 2, unit: "hours" },
      { from, ran: true },
    ),
    from + 120 * MINUTE,
  );
  // Across the spring change: two days later at the same clock time, which
  // is 47 hours.
  assert.equal(
    nextRunAt(
      { kind: "interval", every: 2, unit: "days" },
      { from, ran: true },
    ),
    local(2026, 3, 9, 10, 30),
  );
});

test("daily runs at the next local clock time, across DST changes", () => {
  const daily = { kind: "daily", time: "09:00" } as const;
  assert.equal(
    nextRunAt(daily, { from: local(2026, 3, 7, 8, 0), ran: true }),
    local(2026, 3, 7, 9, 0),
  );
  assert.equal(
    nextRunAt(daily, { from: local(2026, 3, 7, 9, 0), ran: true }),
    local(2026, 3, 8, 9, 0),
  );
  const spring = new Date(
    nextRunAt(daily, { from: local(2026, 3, 7, 12), ran: true })!,
  );
  assert.equal(spring.getHours(), 9);
  const autumn = new Date(
    nextRunAt(daily, { from: local(2026, 10, 31, 12), ran: true })!,
  );
  assert.equal(autumn.getDate(), 1);
  assert.equal(autumn.getHours(), 9);
});

test("a clock time skipped by the spring change runs at the first time after it", () => {
  const at = nextRunAt(
    { kind: "daily", time: "02:30" },
    { from: local(2026, 3, 7, 12), ran: true },
  )!;
  const date = new Date(at);
  assert.equal(date.getDate(), 8);
  assert.equal(date.getHours(), 3);
});

test("weekly runs on the chosen days only", () => {
  // 2026-10-19 is a Monday.
  const weekly: TaskTrigger = { kind: "weekly", time: "18:00", days: [3, 5] };
  const first = nextRunAt(weekly, {
    from: local(2026, 10, 19, 12),
    ran: true,
  })!;
  assert.equal(new Date(first).getDay(), 3);
  assert.equal(first, local(2026, 10, 21, 18));
  const second = nextRunAt(weekly, { from: first, ran: true })!;
  assert.equal(second, local(2026, 10, 23, 18));
  const third = nextRunAt(weekly, { from: second, ran: true })!;
  assert.equal(third, local(2026, 10, 28, 18));
});

test("once runs at its time until it ran; a watch looks at once when new", () => {
  const at = local(2026, 11, 1, 9);
  assert.equal(nextRunAt({ kind: "once", at }, { from: 0, ran: false }), at);
  assert.equal(
    nextRunAt({ kind: "once", at }, { from: at, ran: true }),
    undefined,
  );
  const watch = {
    kind: "watch",
    url: "https://a.test/",
    everyMinutes: 5,
  } as const;
  assert.equal(nextRunAt(watch, { from: 100, ran: false }), 100);
  assert.equal(nextRunAt(watch, { from: 100, ran: true }), 100 + 5 * MINUTE);
});

test("runs missed while the browser was closed make one run, not a backlog", () => {
  const created = local(2026, 10, 1, 8);
  const task: ScheduledTask = {
    id: "t",
    title: "",
    prompt: "p",
    agentId: "a",
    trigger: { kind: "daily", time: "09:00" },
    deviceId: "me",
    enabled: true,
    createdAt: created,
    updatedAt: created,
  };
  const context = { deviceId: "me", allPaused: false };
  // Last ran on the 1st; the browser was closed for a week: one run is due
  // (in the past, so at once), and the next one counts from that run.
  const lastRunAt = local(2026, 10, 1, 9);
  const due = plannedRunAt(task, { failures: 0, lastRunAt }, context)!;
  assert.equal(due, local(2026, 10, 2, 9));
  const ranLate = local(2026, 10, 8, 12);
  assert.equal(
    nextRunAt(task.trigger, { from: ranLate, ran: true }),
    local(2026, 10, 9, 9),
  );
});

test("clock times are read strictly", () => {
  assert.deepEqual(parseClockTime("7:05"), { hours: 7, minutes: 5 });
  assert.equal(parseClockTime("24:00"), undefined);
  assert.equal(parseClockTime("9"), undefined);
});
