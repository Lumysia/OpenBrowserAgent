import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  notificationId,
  parseNotificationId,
  setupTaskNotificationClicks,
} from "../src/background/tasks/notify";
import { runTask } from "../src/background/tasks/scheduler";
import { eventListeners } from "./fake-chrome";
import { schedulerEnv, settle } from "./task-scheduler-env";

afterEach(() => mock.restoreAll());

test("a notification id carries the task, the chat and the window", () => {
  assert.deepEqual(parseNotificationId(notificationId("t", "c", 7)), {
    taskId: "t",
    chatId: "c",
    windowId: 7,
  });
  assert.deepEqual(parseNotificationId(notificationId("t")), {
    taskId: "t",
    chatId: undefined,
    windowId: undefined,
  });
  assert.equal(parseNotificationId("other:1"), undefined);
});

test("a click after the worker restarted opens the panel in the notification's window", async () => {
  const env = await schedulerEnv();
  // The worker that shows the result knows the focused window (1).
  await runTask("t1", { manual: true });
  assert.equal(env.notifications.length, 1);
  const [shown] = env.notifications;
  assert.equal(parseNotificationId(shown.id)?.windowId, 1);
  // A new worker, woken by the click: it has not learned the focused
  // window yet when the click arrives.
  const opened: Array<number | undefined> = [];
  Object.assign(chrome, {
    sidePanel: {
      open: async ({ windowId }: { windowId?: number }) =>
        void opened.push(windowId),
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: () => new Promise(() => {}),
      onFocusChanged: eventListeners(),
    },
  });
  setupTaskNotificationClicks();
  env.onClicked.emit(shown.id);
  await settle();
  assert.deepEqual(opened, [1]);
});
