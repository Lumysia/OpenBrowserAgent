import { Check, X } from "lucide-react";
import { storage } from "../../../src/shared/storage";
import { approveTask, discardTask } from "../../../src/shared/tasks/edit";
import { idleReason } from "../../../src/shared/tasks/lifecycle";
import { taskState } from "../../../src/shared/tasks/normalize";
import { runContextFrom } from "../../../src/shared/tasks/run-context";
import { Button } from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import { useStoredState } from "../../../src/ui/useStoredState";

// The user's OK for a task that waits for it on this device (made or
// changed by the agent, or come by sync): Allow runs it as it is now;
// Discard goes back to what was allowed (or deletes a task never allowed).
// The task list and the task tool's step card show the same buttons.
export function TaskApprovalActions({ taskId }: { taskId: string }) {
  const t = useMessages();
  const fail = (error: unknown) => console.warn(error);
  return (
    <div className="task-approval-actions">
      <Button size="sm" onClick={() => void approveTask(taskId).catch(fail)}>
        <Check size={14} />
        {t.tasks.approval.allow}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void discardTask(taskId).catch(fail)}
      >
        <X size={14} />
        {t.tasks.approval.discard}
      </Button>
    </div>
  );
}

// Whether the task waits for the user's OK here now, read from storage
// (for a step card, which has no task list data).
export function useTaskWaitingForOk(taskId: string) {
  const [tasks] = useStoredState(storage.tasks);
  const [states] = useStoredState(storage.taskStates);
  const [deviceId] = useStoredState(storage.taskDeviceId);
  const [preferences] = useStoredState(storage.preferences);
  const [agents] = useStoredState(storage.agents);
  const [approvals] = useStoredState(storage.agentActApprovals);
  const task = tasks?.find((item) => item.id === taskId);
  if (!task || !states) return false;
  const context = runContextFrom({ deviceId, preferences, agents, approvals });
  return idleReason(task, taskState(states, taskId), context) === "needsOk";
}
