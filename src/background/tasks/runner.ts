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
  observation,
} from "../../shared/tasks/watch-text";
import { runBackgroundChat } from "../sub-agent-run";
import type { TaskOutcome } from "../tools/types";
import { timeTaskInstruction, watchInstruction } from "./run-prompt";
import { closeTaskTab, openTaskTab, readWatchedText } from "./watch-page";

// One run of a task: for a watch, a cheap read of the page first and a
// model run only when it changed (or for the first look); for a time task,
// the model run. Returns what came of it; the scheduler stores it.
export type RunOutcome = {
  result: TaskResult;
  // A watch's new baseline, only after a check that succeeded.
  baseline?: WatchBaseline;
  // A run failed (it counts towards pausing the task).
  failed: boolean;
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
  defaultOutcome: TaskOutcome["outcome"],
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
  const outcome = reported?.outcome ?? defaultOutcome;
  return {
    failed: false,
    result: {
      status: OUTCOME_STATUS[outcome],
      at,
      chatId: run.chatId,
      summary: reported?.summary || firstLine(run.answer),
    },
  };
}

export function runTimeTask(task: ScheduledTask, hooks: RunHooks) {
  // A run that ends without saying is a report: it has an answer to show.
  return runAgent(
    task,
    (readOnly) => timeTaskInstruction(task, readOnly),
    "report",
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
    const text = await readWatchedText(tabId, trigger);
    const current = await observation(text, Date.now());
    const check = compareWithBaseline(baseline, current);
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
      // A check that does not say found no match.
      "notMet",
      hooks,
      tabId,
    );
    return outcome.failed ? outcome : { ...outcome, baseline: current };
  } finally {
    await closeTaskTab(tabId);
    hooks.onTab(undefined);
  }
}
