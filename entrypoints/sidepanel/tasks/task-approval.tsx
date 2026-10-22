import { Check, X } from "lucide-react";
import { approveTask, discardTask } from "../../../src/shared/tasks/edit";
import { Button } from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";

// The user's OK for a task that waits for it on this device (come by sync,
// or its agent's permission to act on its own not allowed here): Allow
// runs it as it is now; Discard goes back to what was allowed (or deletes
// a task never allowed).
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
