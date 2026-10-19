import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { SYNC_COLLECTIONS } from "../src/shared/sync/collections";
import { decodeRoot } from "../src/shared/sync/root";
import { createAgentDraft } from "../src/shared/agents";
import {
  agentActApproval,
  approvalOf,
  mayActHere,
  type AgentActApprovals,
} from "../src/shared/tasks/approval";
import { idleReason, plannedRunAt } from "../src/shared/tasks/lifecycle";
import { runContextFrom } from "../src/shared/tasks/run-context";
import type { ScheduledTask } from "../src/shared/tasks/types";
import { normalizeTasks } from "../src/shared/tasks/normalize";
import { ALL_ON, device, memoryServer, memoryTransport } from "./sync-fixtures";

function setup() {
  const clock = { now: 1_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, server, a, b };
}

const WATCH = {
  id: "watch-1",
  title: "Price",
  prompt: "Tell me when the price drops",
  agentId: "buyer",
  trigger: { kind: "watch", url: "https://shop.test/", everyMinutes: 5 },
  deviceId: "taskdev-a",
  enabled: true,
  createdAt: 10,
  updatedAt: 10,
};

// The task's state on a device where the user allowed it.
const allowed = (task: ScheduledTask) => ({
  failures: 0,
  approved: approvalOf(task, 0),
});

test("task definitions and agent permissions sync; what a device learned stays there", async () => {
  const { a, b } = setup();
  await a.set(STORAGE_KEYS.agents, [
    { id: "buyer", name: "Buyer", toolGroups: ["pages"], actUnattended: true },
  ]);
  await a.set(STORAGE_KEYS.tasks, [WATCH]);
  await a.set(STORAGE_KEYS.taskDevices, [
    { id: "taskdev-a", name: "Linux · AAAA", seenAt: 1 },
  ]);
  await a.set(STORAGE_KEYS.taskStates, {
    "watch-1": { failures: 2, baseline: { hash: "h", text: "t", at: 1 } },
  });
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(b.get(STORAGE_KEYS.tasks), [WATCH]);
  assert.equal(
    b.get<Array<{ actUnattended?: boolean }>>(STORAGE_KEYS.agents)[0]
      .actUnattended,
    true,
  );
  assert.equal(b.get<unknown[]>(STORAGE_KEYS.taskDevices).length, 1);
  assert.equal(b.get(STORAGE_KEYS.taskStates), undefined);
});

test("each task runs only on the device that owns it; changing the owner moves it", async () => {
  const { clock, a, b } = setup();
  await a.set(STORAGE_KEYS.tasks, [WATCH]);
  await a.sync("edit");
  await b.sync();
  const onA = { deviceId: "taskdev-a", allPaused: false };
  const onB = { deviceId: "taskdev-b", allPaused: false };
  const [taskOnB] = normalizeTasks(b.get(STORAGE_KEYS.tasks));
  assert.equal(plannedRunAt(taskOnB, allowed(taskOnB), onB), undefined);
  assert.notEqual(plannedRunAt(taskOnB, allowed(taskOnB), onA), undefined);
  clock.now += 1000;
  await b.set(STORAGE_KEYS.tasks, [
    { ...WATCH, deviceId: "taskdev-b", updatedAt: 20 },
  ]);
  await b.sync("edit");
  await a.sync();
  const [taskOnA] = normalizeTasks(a.get(STORAGE_KEYS.tasks));
  assert.equal(plannedRunAt(taskOnA, allowed(taskOnA), onA), undefined);
  assert.notEqual(plannedRunAt(taskOnA, allowed(taskOnA), onB), undefined);
});

test("a task that comes by sync does not run here until the user allows it here", async () => {
  const { clock, a, b } = setup();
  // Created on A for B to run.
  const forB = { ...WATCH, deviceId: "taskdev-b" };
  await a.set(STORAGE_KEYS.tasks, [forB]);
  await a.sync("edit");
  await b.sync();
  const onB = { deviceId: "taskdev-b", allPaused: false };
  let [task] = normalizeTasks(b.get(STORAGE_KEYS.tasks));
  assert.equal(idleReason(task, { failures: 0 }, onB), "needsOk");
  assert.equal(plannedRunAt(task, { failures: 0 }, onB), undefined);
  // Allowed on B (local state only).
  const state = allowed(task);
  assert.notEqual(plannedRunAt(task, state, onB), undefined);
  assert.equal(b.get(STORAGE_KEYS.taskStates), undefined, "not synced");
  // A renames it: still allowed. A changes what it does: asks again.
  for (const [change, waits] of [
    [{ title: "Price watch" }, false],
    [{ prompt: "Tell me when the price is below 40" }, true],
  ] as const) {
    clock.now += 1000;
    await a.set(STORAGE_KEYS.tasks, [
      { ...forB, ...change, updatedAt: clock.now },
    ]);
    await a.sync("edit");
    await b.sync();
    [task] = normalizeTasks(b.get(STORAGE_KEYS.tasks));
    assert.equal(idleReason(task, state, onB) === "needsOk", waits);
  }
});

test("acting turned on by sync does not act here until allowed here", () => {
  const agent = {
    ...createAgentDraft("Buyer"),
    id: "buyer",
    actUnattended: true,
  };
  const task = normalizeTasks([{ ...WATCH, deviceId: "taskdev-b" }])[0];
  const onB = (approvals: AgentActApprovals) =>
    runContextFrom({
      deviceId: "taskdev-b",
      preferences: { tasksPaused: false },
      agents: [agent],
      approvals,
    });
  assert.equal(mayActHere(agent, {}), false);
  assert.equal(idleReason(task, allowed(task), onB({})), "needsOk");
  const here = { buyer: agentActApproval(agent) };
  assert.equal(mayActHere(agent, here), true);
  assert.equal(idleReason(task, allowed(task), onB(here)), undefined);
  // Its tool groups changed by sync: asks again.
  const wider = { ...agent, toolGroups: [...agent.toolGroups, "scripts"] };
  assert.equal(mayActHere(wider as typeof agent, here), false);
});

test("a 0.2.0 device, which has no task collections, leaves tasks in the sync data", async () => {
  const { clock, server, a, b } = setup();
  await a.set(STORAGE_KEYS.tasks, [WATCH]);
  await a.sync("edit");
  // The last release does not know the task collections.
  const removed = SYNC_COLLECTIONS.filter((collection) =>
    collection.name.startsWith("task"),
  );
  const kept = SYNC_COLLECTIONS.filter(
    (collection) => !removed.includes(collection),
  );
  SYNC_COLLECTIONS.splice(0, SYNC_COLLECTIONS.length, ...kept);
  try {
    clock.now += 1000;
    await b.set(STORAGE_KEYS.preferences, { autoScroll: false });
    await b.sync("edit");
  } finally {
    SYNC_COLLECTIONS.splice(0, SYNC_COLLECTIONS.length, ...kept, ...removed);
  }
  const root = await decodeRoot(server.root!);
  assert.ok(root.records["tasks/watch-1"], "the task record is still there");
  await a.sync();
  assert.deepEqual(a.get(STORAGE_KEYS.tasks), [WATCH]);
});
