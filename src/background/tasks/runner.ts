import { mayActUnattended, resolveAgent } from "../../shared/agents";
import { storage } from "../../shared/storage";
import {
  TASK_RESULT,
  TASK_LIMITS,
  type ScheduledTask,
  type TaskResult,
  type TaskResultStatus,
  type WatchBaseline,
} from "../../shared/tasks/types";
import {
  compareWithBaseline,
  normalizeWatchedText,
  observation,
} from "../../shared/tasks/watch-text";
import { closeAgentTabs } from "../agent-tabs";
import { runBackgroundChat } from "../sub-agent-run";
import type { TaskOutcome } from "../tools/types";
import { timeTaskInstruction, watchInstruction } from "./run-prompt";
import {
  closeTaskTab,
  openTaskTab,
  pageUnreachable,
  readWatchedText,
  taskTabOwner,
} from "./watch-page";

// One run of a task: for a watch, a cheap read of the page first and a
// model run only when it changed (or for the first look); for a time task,
// the model run. Returns what came of it; the scheduler stores it.
export type RunOutcome = {
  result: TaskResult;
  // What a watch saw (the scheduler keeps it only after a verdict).
  baseline?: WatchBaseline;
  // A run failed (it counts towards pausing the task).
  failed: boolean;
  // It could not reach its page or the network (see RunEnd).
  skipped?: boolean;
};

export type RunHooks = {
  // The run's chat exists (it can be followed live).
  onChat(chatId: string): void;
  // The helper tab the run reads in, closed when the run ends.
  onTab(tabId: number | undefined): void;
};

const OUTCOME_STATUS: Record<TaskOutcome["outcome"], TaskResultStatus> = {
  report: TASK_RESULT.reported,
  nothing: TASK_RESULT.nothing,
  met: TASK_RESULT.met,
  notMet: TASK_RESULT.notMet,
};

function firstLine(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > TASK_LIMITS.summaryChars
    ? `${line.slice(0, TASK_LIMITS.summaryChars - 1)}…`
    : line;
}

async function runAgent(
  task: ScheduledTask,
  instruction: (readOnly: boolean) => string,
  hooks: RunHooks,
  tabId?: number,
): Promise<RunOutcome> {
  const agent = resolveAgent(await storage.agents.get(), task.agentId);
  const readOnly = !mayActUnattended(agent);
  let reported: TaskOutcome | undefined;
  let question: string | undefined;
  const run = await runBackgroundChat({
    agent,
    content: task.prompt,
    instruction: instruction(readOnly),
    title: task.title,
    link: { kind: "normal", taskId: task.id },
    tabId,
    depth: 0,
    unattended: {
      needsUser: (text) => (question ??= text),
      report: (outcome) => (reported = outcome),
    },
    messageMetadata: { taskId: task.id },
    onStart: hooks.onChat,
  });
  // Tabs the run opened (pages it browsed) close with it: nobody is there
  // to look at them, and the result is in the chat.
  await closeAgentTabs({ chatId: run.chatId });
  const at = Date.now();
  if (question !== undefined)
    return {
      failed: false,
      result: {
        status: TASK_RESULT.needsUser,
        at,
        chatId: run.chatId,
        summary: firstLine(run.answer) || firstLine(question),
      },
    };
  if (run.error && !run.answer && (await pageUnreachable(tabId)))
    return skippedRun();
  if (run.error && !run.answer)
    return {
      failed: true,
      result: {
        status: TASK_RESULT.failed,
        at,
        chatId: run.chatId,
        summary: firstLine(run.error),
      },
    };
  // Without its outcome (never reported, or the run broke off after a
  // partial answer) the run judged nothing: it is shown, not notified.
  const verdict = reported && !run.error ? reported : undefined;
  return {
    failed: false,
    result: {
      status: verdict ? OUTCOME_STATUS[verdict.outcome] : TASK_RESULT.answered,
      at,
      chatId: run.chatId,
      summary: verdict?.summary || firstLine(run.answer),
    },
  };
}

// The scheduler runs tasks through this object.
export const taskRunner = {
  runTimeTask: (task: ScheduledTask, hooks: RunHooks) =>
    runTimeTask(task, hooks),
  runWatch: (
    task: ScheduledTask,
    baseline: WatchBaseline | undefined,
    hooks: RunHooks,
  ) => runWatch(task, baseline, hooks),
};

// A run that could not reach the page or the network: not a failure.
function skippedRun(): RunOutcome {
  return {
    failed: false,
    skipped: true,
    result: { status: TASK_RESULT.unchanged, at: Date.now() },
  };
}

export async function runTimeTask(task: ScheduledTask, hooks: RunHooks) {
  if (await pageUnreachable()) return skippedRun();
  return runAgent(
    task,
    (readOnly) => timeTaskInstruction(task, readOnly),
    hooks,
  );
}

export async function runWatch(
  task: ScheduledTask,
  baseline: WatchBaseline | undefined,
  hooks: RunHooks,
): Promise<RunOutcome> {
  const { trigger } = task;
  if (trigger.kind !== "watch") throw new Error("Not a watch.");
  let tabId: number | undefined;
  try {
    tabId = await openTaskTab(task.id, trigger.url);
    hooks.onTab(tabId);
    if (await pageUnreachable(tabId)) return skippedRun();
    const text = await readWatchedText(tabId, trigger).catch(
      async (error: unknown) => {
        if (await pageUnreachable(tabId)) return undefined;
        throw error;
      },
    );
    if (text === undefined) return skippedRun();
    return await judgeWatch(task, baseline, text, tabId, hooks);
  } finally {
    await closeTaskTab(tabId);
    await closeAgentTabs(taskTabOwner(task.id));
    hooks.onTab(undefined);
  }
}

// What a watch makes of the text it read in `tabId`: nothing more when it
// is unchanged (no model run), else the agent judges the change.
export async function judgeWatch(
  task: ScheduledTask,
  baseline: WatchBaseline | undefined,
  text: string,
  tabId: number,
  hooks: RunHooks,
): Promise<RunOutcome> {
  const { trigger } = task;
  if (trigger.kind !== "watch") throw new Error("Not a watch.");
  const current = await observation(text, Date.now());
  const check = compareWithBaseline(
    baseline,
    current,
    normalizeWatchedText(text),
  );
  if (check.kind === "unchanged")
    return {
      failed: false,
      baseline,
      result: { status: TASK_RESULT.unchanged, at: Date.now() },
    };
  const outcome = await runAgent(
    task,
    (readOnly) =>
      watchInstruction(task, readOnly, trigger.url, check, current.text),
    hooks,
    tabId,
  );
  return outcome.failed ? outcome : { ...outcome, baseline: current };
}
