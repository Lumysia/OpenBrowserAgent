import { TASK_LIMITS } from "../../shared/tasks/types";
import type { Agent } from "../../shared/types";
import { TOOL_NAME } from "../../shared/tool-names";
import { trimmedString } from "../../shared/values";
import {
  createTaskAction,
  deleteTaskAction,
  getTask,
  listTasks,
  runTaskNow,
  setTaskPaused,
  updateTaskAction,
} from "./task-actions";
import { fail, json, ok, schema, type ToolDefinition } from "./types";

const OUTCOMES = ["report", "nothing", "met", "notMet"] as const;

// Only in a scheduled task's own run: how it came out, which decides
// whether the user is notified.
export const taskResultTool: ToolDefinition = {
  name: TOOL_NAME.taskResult,
  effects: "read",
  available: (setup) => !!setup.unattended?.report,
  summary: "Report the outcome of this scheduled task run",
  description:
    'Report how this scheduled task run came out, once, before your final answer. outcome: "report" (something to tell the user) or "nothing" for a time task; "met" or "notMet" for a watch. summary: one sentence for the notification.',
  parameters: schema(
    {
      outcome: { type: "string", enum: [...OUTCOMES] },
      summary: { type: "string" },
    },
    ["outcome", "summary"],
  ),
  async execute(input, { run }) {
    const outcome = OUTCOMES.find((item) => item === input.outcome);
    if (!outcome) return fail(`outcome must be one of ${OUTCOMES.join(", ")}.`);
    const summary = trimmedString(input.summary).slice(
      0,
      TASK_LIMITS.summaryChars,
    );
    run.unattended?.report?.({ outcome, summary });
    return ok("Recorded. Now give your final answer.", { outcome, summary });
  },
};

const ACTIONS = [
  "list",
  "get",
  "create",
  "update",
  "delete",
  "runNow",
  "pause",
  "resume",
] as const;

// The agent manages the user's scheduled tasks when asked in words ("check
// this page every hour…", "stop the price watch"). What it creates,
// changes or turns on waits for the user's OK on this device; it never
// changes what an agent may do. Not in runs nobody watches.
export const tasksTool: ToolDefinition = {
  name: TOOL_NAME.tasks,
  group: "tasks",
  effects: { byAction: { list: "read", get: "read" } },
  onDemand: true,
  available: (setup) => setup.depth === 0 && !setup.unattended,
  summary:
    "List, create, change, run, pause or delete scheduled tasks and page watches",
  description: `Manage the user's scheduled tasks and page watches when they ask ("every morning…", "in an hour…", "tell me when this page…", "stop that watch"). A task runs later on its own with an agent, and the user gets a notification with the result.
action: list (every task with its id, schedule, agent, device, state, last result and next run); get (one task by id, with its prompt and recent runs' chat ids); create; update (id and the fields to change); delete (id); runNow (id; only tasks of this device that are allowed); pause / resume (id).
Schedule fields: kind: once (at: local date and time, ISO 8601 such as 2026-05-01T09:00), interval (every, unit: minutes|hours|days), daily (time HH:MM), weekly (time, days: 0=Sunday..6), watch (url, everyMinutes >= ${TASK_LIMITS.minWatchMinutes}, default ${TASK_LIMITS.defaultWatchMinutes}; checks the page cheaply and runs the agent only when it changed). In update, give kind for a new schedule or only the fields to change.
prompt: what to do each run, or for a watch the condition and what to report. create runs with your agent; update may name another agent (agent: its name). What you create, change or turn on waits for the user's OK before it runs: say so. Tell the user what you did.`,
  parameters: schema(
    {
      action: { type: "string", enum: [...ACTIONS] },
      id: { type: "string", description: "The task's id (from list)." },
      title: { type: "string" },
      prompt: { type: "string" },
      agent: { type: "string" },
      enabled: { type: "boolean" },
      kind: {
        type: "string",
        enum: ["once", "interval", "daily", "weekly", "watch"],
      },
      at: { type: "string" },
      every: { type: "number" },
      unit: { type: "string", enum: ["minutes", "hours", "days"] },
      time: { type: "string" },
      days: { type: "array", items: { type: "number" } },
      url: { type: "string" },
      everyMinutes: { type: "number" },
    },
    ["action"],
  ),
  async execute(input, { run }) {
    const action = ACTIONS.find((item) => item === input.action);
    if (!action) return fail(`action must be one of ${ACTIONS.join(", ")}.`);
    const outcome = await TASK_ACTIONS[action](input, run.agent);
    return json({ action, ...outcome });
  },
};

const TASK_ACTIONS: Record<
  (typeof ACTIONS)[number],
  (
    input: Record<string, unknown>,
    agent: Agent,
  ) => Promise<Record<string, unknown>>
> = {
  list: () => listTasks(),
  get: (input) => getTask(input),
  create: (input, agent) => createTaskAction(input, agent),
  update: (input) => updateTaskAction(input),
  delete: (input) => deleteTaskAction(input),
  runNow: (input) => runTaskNow(input),
  pause: (input) => setTaskPaused(input, true),
  resume: (input) => setTaskPaused(input, false),
};
