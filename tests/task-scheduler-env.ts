import { mock } from "node:test";
import { storage } from "../src/shared/storage";
import type { RunEnd } from "../src/shared/tasks/lifecycle";
import {
  TASK_RESULT,
  type ScheduledTask,
  type TaskStates,
} from "../src/shared/tasks/types";
import { taskRunner, type RunHooks } from "../src/background/tasks/runner";
import { eventListeners, fakeTabs, installChrome } from "./fake-chrome";

// The scheduler's browser in memory: alarms, notifications, the badge and
// tabs; the runner replaced by `run`, which says how each run ends.

export const DEVICE = "me";

export function task(patch: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "t1",
    title: "Prices",
    prompt: "Check the prices",
    agentId: "custom",
    trigger: { kind: "interval", every: 1, unit: "hours" },
    deviceId: DEVICE,
    enabled: true,
    createdAt: Date.now() - 2 * 60 * 60_000,
    updatedAt: Date.now() - 2 * 60 * 60_000,
    ...patch,
  };
}

export const reported = (summary = "Found it"): RunEnd => ({
  failed: false,
  result: { status: TASK_RESULT.reported, at: Date.now(), summary },
});

type Run = (task: ScheduledTask, hooks: RunHooks) => Promise<RunEnd>;

export async function schedulerEnv({
  tasks = [task()],
  states = {} as TaskStates,
  run = (async () => reported()) as Run,
  tabs = [] as Array<{ id: number; windowId?: number }>,
} = {}) {
  const alarms = new Map<string, { name: string; scheduledTime: number }>();
  const onAlarm = eventListeners<(alarm: { name: string }) => void>();
  const notifications: Array<{ id: string; title: string }> = [];
  const onClicked = eventListeners<(id: string) => void>();
  const fake = fakeTabs(tabs.map((tab) => ({ windowId: 1, ...tab })));
  const removed: number[] = [];
  const env = installChrome({
    alarms: {
      create: async (name: string, info: { when: number }) =>
        void alarms.set(name, { name, scheduledTime: info.when }),
      clear: async (name: string) => alarms.delete(name),
      getAll: async () => [...alarms.values()],
      onAlarm,
    },
    notifications: {
      create: async (id: string, options: { title: string }) => {
        notifications.push({ id, title: options.title });
        return id;
      },
      clear: async () => true,
      onClicked,
    },
    action: { setBadgeText: async () => undefined },
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      getPlatformInfo: async () => ({ os: "linux" }),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: async () => ({ id: 1 }),
      onFocusChanged: eventListeners(),
    },
    tabs: {
      ...fake.api,
      remove: async (ids: number | number[]) => {
        removed.push(...[ids].flat());
        return fake.api.remove(ids);
      },
    },
  });
  await storage.taskDeviceId.set(DEVICE);
  await storage.tasks.replace(tasks);
  await storage.taskStates.set(states);
  const runs: Array<{ task: ScheduledTask; hooks: RunHooks }> = [];
  const runner = async (task: ScheduledTask, hooks: RunHooks) => {
    runs.push({ task, hooks });
    return run(task, hooks);
  };
  mock.method(taskRunner, "runTimeTask", runner);
  mock.method(
    taskRunner,
    "runWatch",
    (task: ScheduledTask, _b: unknown, hooks: RunHooks) => runner(task, hooks),
  );
  return {
    ...env,
    alarms,
    onAlarm,
    notifications,
    onClicked,
    removed,
    runs,
    tabs: fake,
  };
}

// Until the queued runs and what follows them (storage writes) are done.
export async function settle(ms = 30) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
