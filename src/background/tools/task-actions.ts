import { mayActUnattended, normalizeAgents } from "../../shared/agents";
import { storage } from "../../shared/storage";
import {
  createTask,
  deleteTask,
  describeTrigger,
  updateTask,
  type TaskPatch,
} from "../../shared/tasks/edit";
import { localIsoTime } from "../../shared/local-time";
import {
  idleReason,
  plannedRunAt,
  type RunContext,
} from "../../shared/tasks/lifecycle";
import { normalizeTrigger, taskState } from "../../shared/tasks/normalize";
import { MINUTE_MS } from "../../shared/tasks/schedule";
import { loadRunContext } from "../../shared/tasks/run-context";
import {
  TRIGGER_FIELDS,
  type ScheduledTask,
  type TaskState,
} from "../../shared/tasks/types";
import { trimmedString } from "../../shared/values";
import type { Agent } from "../../shared/types";
import { resumeTask, startTaskRun } from "../tasks/scheduler";

// What the agent's task tool does, on the same edits as the task list
// (shared/tasks/edit.ts): the user asked for them in the chat, so they
// are allowed as made. Only an agent's permission to act on its own that
// was not allowed on this device still waits (see approval.ts).

const RECENT_RUNS = 10;

const AGENT_WAITS_FOR_OK =
  "Its agent's permission to act on its own was turned on on another device and is not allowed on this device yet: the task does not run here until the user allows it in the task list. Tell the user.";

type Input = Record<string, unknown>;
type Outcome = Record<string, unknown> & { error?: string };

// Times in the user's local time with the offset, as the model gives them.
const iso = (time: number | undefined) =>
  time === undefined ? undefined : localIsoTime(time);

// The task's state in words for the model.
const STATUS: Record<string, string> = {
  otherDevice: "runs on another device",
  disabled: "paused by the user",
  needsOk: "waiting for the user's OK",
  failures: "paused after repeated failures",
  needsUser: "paused: a run needs the user's answer",
  allPaused: "all tasks are paused in settings",
  unsupported: "made by a newer version; does not run here",
};

function statusText(
  task: ScheduledTask,
  state: TaskState,
  context: RunContext,
) {
  if (state.running) return "running now";
  const reason = idleReason(task, state, context);
  if (reason) return STATUS[reason] ?? reason;
  if (task.trigger.kind === "once" && state.lastRunAt !== undefined)
    return "done";
  return "scheduled";
}

async function snapshot() {
  const [tasks, states, devices, agents, context] = await Promise.all([
    storage.tasks.get(),
    storage.taskStates.get(),
    storage.taskDevices.get(),
    storage.agents.get(),
    loadRunContext(),
  ]);
  return {
    tasks,
    states,
    context,
    agents: normalizeAgents(agents),
    deviceName: (id: string) =>
      devices.find((device) => device.id === id)?.name || id.slice(0, 8),
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function summary(task: ScheduledTask, view: Snapshot) {
  const state = taskState(view.states, task.id);
  const reason = idleReason(task, state, view.context);
  const result = state.lastResult;
  return {
    id: task.id,
    title: task.title,
    schedule: describeTrigger(task.trigger),
    agent:
      view.agents.find((agent) => agent.id === task.agentId)?.name ??
      task.agentId,
    device: view.deviceName(task.deviceId),
    thisDevice: task.deviceId === view.context.deviceId,
    enabled: task.enabled,
    status: statusText(task, state, view.context),
    waitingForOk: reason === "needsOk",
    lastResult: result && {
      status: result.status,
      at: iso(result.at),
      summary: result.summary,
      chatId: result.chatId,
    },
    nextRun: iso(plannedRunAt(task, state, view.context)),
  };
}

function findTask(view: Snapshot, input: Input) {
  const id = trimmedString(input.id);
  return view.tasks.find((task) => task.id === id);
}

const notFound = (input: Input): Outcome => ({
  error: `No task with id "${trimmedString(input.id)}". List the tasks to find its id.`,
});

// The agent named by id or name; undefined names none.
function namedAgent(agents: Agent[], value: unknown) {
  const name = trimmedString(value).toLowerCase();
  if (!name) return undefined;
  return agents.find(
    (agent) => agent.id === name || agent.name.toLowerCase() === name,
  );
}

// The schedule the input gives: a whole new one with `kind`, or the
// current one with the fields given changed. Errors are for the model.
function triggerFrom(
  input: Input,
  current?: ScheduledTask["trigger"],
): { trigger?: ScheduledTask["trigger"]; error?: string } {
  const relative = relativeAt(input, current);
  if (relative.error) return relative;
  const given = TRIGGER_FIELDS.filter((field) => input[field] !== undefined);
  if (!given.length && relative.at === undefined) return {};
  const fields: Input = Object.fromEntries(
    given.map((field) => [field, input[field]]),
  );
  if (relative.at !== undefined) fields.at = relative.at;
  else if (fields.at !== undefined) {
    const at = Date.parse(trimmedString(fields.at));
    if (!Number.isFinite(at))
      return {
        error: "at must be a local date and time such as 2026-05-01T09:00.",
      };
    fields.at = at;
  }
  const base = !fields.kind || fields.kind === current?.kind ? current : {};
  const trigger = normalizeTrigger({ ...base, ...fields });
  if (!trigger || trigger.kind === "unknown")
    return {
      error:
        (fields.kind ?? current?.kind) === "watch"
          ? "url must be an http(s) page address."
          : "Give a valid schedule: kind and its fields.",
    };
  return { trigger };
}

// A one-time task "in 5 minutes": the time counted from now, so the model
// need not add to a clock.
function relativeAt(
  input: Input,
  current?: ScheduledTask["trigger"],
): { at?: number; error?: string } {
  if (input.inMinutes === undefined) return {};
  if (input.at !== undefined)
    return { error: "Give at or inMinutes, not both." };
  if ((input.kind ?? current?.kind) !== "once")
    return { error: "inMinutes is only for kind once." };
  const minutes = input.inMinutes;
  if (typeof minutes !== "number" || !(minutes > 0))
    return { error: "inMinutes must be a number of minutes above 0." };
  return { at: Date.now() + minutes * MINUTE_MS };
}

function changeNote(agent: Agent | undefined) {
  return agent && mayActUnattended(agent)
    ? "Its agent may act on its own, so runs can use its acting tools."
    : "Runs only look (read, search, report); they cannot click, type or change anything.";
}

export async function listTasks(): Promise<Outcome> {
  const view = await snapshot();
  return {
    count: view.tasks.length,
    tasks: view.tasks.map((task) => summary(task, view)),
  };
}

export async function getTask(input: Input): Promise<Outcome> {
  const view = await snapshot();
  const task = findTask(view, input);
  if (!task) return notFound(input);
  const runs = (await storage.chats.get())
    .filter((chat) => chat.taskId === task.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_RUNS)
    .map((chat) => ({ chatId: chat.id, at: iso(chat.createdAt) }));
  return {
    ...summary(task, view),
    prompt: task.prompt,
    trigger: task.trigger,
    recentRuns: runs,
  };
}

export async function createTaskAction(
  input: Input,
  agent: Agent,
): Promise<Outcome> {
  const prompt = trimmedString(input.prompt);
  if (!prompt) return { error: "prompt is required." };
  if (!input.kind) return { error: "kind is required." };
  const { trigger, error } = triggerFrom(input);
  if (!trigger) return { error: error || "Give a valid schedule." };
  const task = await createTask({
    title: trimmedString(input.title) || prompt.slice(0, 60),
    prompt,
    agentId: agent.id,
    trigger,
  });
  if (!task) return { error: "The task could not be created." };
  return changedResult(task);
}

export async function updateTaskAction(input: Input): Promise<Outcome> {
  const view = await snapshot();
  const task = findTask(view, input);
  if (!task) return notFound(input);
  const patch: TaskPatch = {};
  if (input.title !== undefined) patch.title = trimmedString(input.title);
  if (input.prompt !== undefined) {
    patch.prompt = trimmedString(input.prompt);
    if (!patch.prompt) return { error: "prompt cannot be empty." };
  }
  if (input.agent !== undefined) {
    const agent = namedAgent(view.agents, input.agent);
    if (!agent)
      return {
        error: `No agent "${trimmedString(input.agent)}". Agents: ${view.agents.map((item) => item.name).join(", ")}.`,
      };
    patch.agentId = agent.id;
  }
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  const { trigger, error } = triggerFrom(input, task.trigger);
  if (error) return { error };
  if (trigger) patch.trigger = trigger;
  if (!Object.keys(patch).length)
    return { error: "Nothing to change: give the fields to change." };
  const saved = await updateTask(task.id, patch);
  if (!saved) return { error: "That change does not make a valid task." };
  return changedResult(saved);
}

// After a change: what the task is now, whether its runs may act, and
// whether it still waits for the user's OK.
async function changedResult(task: ScheduledTask): Promise<Outcome> {
  const view = await snapshot();
  const now = summary(task, view);
  const agent = view.agents.find((item) => item.id === task.agentId);
  return {
    success: true,
    taskId: task.id,
    title: task.title,
    schedule: now.schedule,
    agent: now.agent,
    mayAct: !!agent && mayActUnattended(agent),
    status: now.status,
    waitingForOk: now.waitingForOk,
    nextRun: now.nextRun,
    note: now.waitingForOk
      ? `${changeNote(agent)} ${AGENT_WAITS_FOR_OK}`
      : changeNote(agent),
  };
}

export async function deleteTaskAction(input: Input): Promise<Outcome> {
  const view = await snapshot();
  const task = findTask(view, input);
  if (!task) return notFound(input);
  await deleteTask(task.id);
  return { success: true, taskId: task.id, title: task.title, deleted: true };
}

export async function runTaskNow(input: Input): Promise<Outcome> {
  const view = await snapshot();
  const task = findTask(view, input);
  if (!task) return notFound(input);
  const started = await startTaskRun(task.id);
  if (!started)
    return {
      error: `The task did not start: it is ${summary(task, view).status}.`,
      taskId: task.id,
      title: task.title,
    };
  return {
    success: true,
    taskId: task.id,
    title: task.title,
    started: true,
    note: "It runs in the background; its result comes as a notification and in the task list.",
  };
}

export async function setTaskPaused(
  input: Input,
  paused: boolean,
): Promise<Outcome> {
  const view = await snapshot();
  const task = findTask(view, input);
  if (!task) return notFound(input);
  if (paused) {
    const saved = await updateTask(task.id, { enabled: false });
    return saved ? changedResult(saved) : notFound(input);
  }
  if (!task.enabled) await updateTask(task.id, { enabled: true });
  if (taskState(view.states, task.id).pausedBy) await resumeTask(task.id);
  const current = (await storage.tasks.get()).find(
    (item) => item.id === task.id,
  );
  return current ? changedResult(current) : notFound(input);
}
