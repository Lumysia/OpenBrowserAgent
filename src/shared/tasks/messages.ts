import { getBrowserApi } from "../browser-api";
import { replyValue, type RuntimeReply } from "../runtime-messages";

// What the task list asks the background, which runs the tasks.
export const TASK_MESSAGE = {
  // Run a task now, whatever its schedule.
  runNow: "tasks:runNow",
  // Resume a task the scheduler paused (failures, or it needed the user).
  resume: "tasks:resume",
  // The user saw the task list: clear the badge.
  seen: "tasks:seen",
} as const;

export type TaskMessage =
  | { type: typeof TASK_MESSAGE.runNow; taskId: string }
  | { type: typeof TASK_MESSAGE.resume; taskId: string }
  | { type: typeof TASK_MESSAGE.seen };

const MESSAGE_TYPES = new Set<string>(Object.values(TASK_MESSAGE));

export function isTaskMessage(message: unknown): message is TaskMessage {
  const type = (message as { type?: unknown } | undefined)?.type;
  return typeof type === "string" && MESSAGE_TYPES.has(type);
}

export async function sendTaskMessage(message: TaskMessage) {
  const reply = (await getBrowserApi().runtime.sendMessage(message)) as
    RuntimeReply<boolean> | undefined;
  return replyValue(reply, "The background");
}
