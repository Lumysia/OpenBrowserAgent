import { useEffect } from "react";
import { storage } from "../../../src/shared/storage";
import {
  createTask,
  deleteTask,
  updateTask,
  type TaskDraft,
} from "../../../src/shared/tasks/edit";
import {
  sendTaskMessage,
  TASK_MESSAGE,
} from "../../../src/shared/tasks/messages";
import type { RunContext } from "../../../src/shared/tasks/lifecycle";
import type { ScheduledTask, TaskState } from "../../../src/shared/tasks/types";
import { useStoredState } from "../../../src/ui/useStoredState";

// The task list's data and what can be done to it. Definitions are edited
// in storage (the background re-arms its alarms when they change); runs and
// what only the scheduler may change go to the background.
export function useTasks() {
  const [tasks] = useStoredState(storage.tasks);
  const [states] = useStoredState(storage.taskStates);
  const [devices] = useStoredState(storage.taskDevices);
  const [deviceId] = useStoredState(storage.taskDeviceId);
  const [preferences] = useStoredState(storage.preferences);

  // Seeing the list clears the toolbar badge.
  useEffect(() => {
    sendTaskMessage({ type: TASK_MESSAGE.seen }).catch(() => undefined);
  }, []);

  const context: RunContext = {
    deviceId: deviceId || "",
    allPaused: preferences?.tasksPaused === true,
  };

  return {
    loading: !tasks || !states || !devices,
    tasks: tasks || [],
    states: states || {},
    devices: devices || [],
    context,
    save: (draft: TaskDraft, id?: string) =>
      id ? updateTask(id, draft) : createTask(draft),
    remove: (id: string) => deleteTask(id),
    runNow: (id: string) =>
      sendTaskMessage({ type: TASK_MESSAGE.runNow, taskId: id }),
    // Pausing is the user's (it syncs); resuming also clears a pause the
    // scheduler set.
    setPaused: async (
      task: ScheduledTask,
      state: TaskState,
      paused: boolean,
    ) => {
      if (paused) return updateTask(task.id, { enabled: false });
      if (!task.enabled) await updateTask(task.id, { enabled: true });
      if (state.pausedBy)
        await sendTaskMessage({ type: TASK_MESSAGE.resume, taskId: task.id });
    },
  };
}
