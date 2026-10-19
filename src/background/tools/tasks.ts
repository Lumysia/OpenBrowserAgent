import { mayActUnattended } from "../../shared/agents";
import { createTask, describeTrigger } from "../../shared/tasks/edit";
import { normalizeTrigger } from "../../shared/tasks/normalize";
import { TASK_LIMITS, TRIGGER_FIELDS } from "../../shared/tasks/types";
import { TOOL_NAME } from "../../shared/tool-names";
import { trimmedString } from "../../shared/values";
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

// Creates a task when the user asks for one in words. The task runs with
// this chat's agent, so it can act on its own only if the user gave that
// agent the permission; this tool never changes it.
export const scheduleTaskTool: ToolDefinition = {
  name: TOOL_NAME.scheduleTask,
  effects: "act",
  onDemand: true,
  available: (setup) => setup.depth === 0 && !setup.unattended,
  summary:
    "Schedule a task for later or repeatedly, or watch a page for a change",
  description: `Create a scheduled task or a page watch when the user asks for one ("every morning…", "in an hour…", "tell me when this page…"). The task runs later with your agent, on its own, and the user gets a notification with the result. kind: once (at: local date and time, ISO 8601 such as 2026-05-01T09:00), interval (every, unit: minutes|hours|days), daily (time HH:MM), weekly (time, days: 0=Sunday..6), watch (url, everyMinutes >= ${TASK_LIMITS.minWatchMinutes}, default ${TASK_LIMITS.defaultWatchMinutes}; checks the page cheaply and runs you only when it changed). prompt: what to do each run, or for a watch the condition and what to report. Tell the user what you created; they can change it in the task list.`,
  parameters: schema(
    {
      title: { type: "string" },
      prompt: { type: "string" },
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
    ["title", "prompt", "kind"],
  ),
  async execute(input, { run }) {
    const prompt = trimmedString(input.prompt);
    if (!prompt) return fail("prompt is required.");
    const at =
      input.kind === "once" ? Date.parse(trimmedString(input.at)) : undefined;
    if (input.kind === "once" && !Number.isFinite(at))
      return fail("at must be a local date and time such as 2026-05-01T09:00.");
    const trigger = normalizeTrigger({
      ...Object.fromEntries(
        TRIGGER_FIELDS.map((field) => [field, input[field]]),
      ),
      at,
    });
    if (!trigger)
      return fail(
        input.kind === "watch"
          ? "url must be an http(s) page address."
          : "Give a valid schedule.",
      );
    const task = await createTask({
      title: trimmedString(input.title) || prompt.slice(0, 60),
      prompt,
      agentId: run.agent.id,
      trigger,
    });
    if (!task) return fail("The task could not be created.");
    const acts = mayActUnattended(run.agent);
    return json({
      success: true,
      taskId: task.id,
      title: task.title,
      schedule: describeTrigger(task.trigger),
      agent: run.agent.name,
      mayAct: acts,
      note: acts
        ? "This agent may act on its own, so runs can use its acting tools."
        : "Runs only look (read, search, report); they cannot click, type or change anything.",
    });
  },
};
