import { getBrowserApi } from "../../shared/browser-api";
import { getMessages } from "../../shared/i18n";
import { storage } from "../../shared/storage";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import type {
  ScheduledTask,
  TaskResult,
  TaskStates,
} from "../../shared/tasks/types";
import {
  idleReason,
  type Notice,
  type RunContext,
} from "../../shared/tasks/lifecycle";
import { taskState } from "../../shared/tasks/normalize";
import { loadRunContext } from "../../shared/tasks/run-context";
import { notificationsApi } from "../../shared/tasks/notifications";
import { handOffToSidePanel } from "../side-panel-handoff";

// System notifications for task results, where the browser has them
// (Chromium, Firefox; not Safari). The action badge and the task list show
// the same results everywhere.

const NOTIFICATION_PREFIX = "oba-task:";
const ICON_PATH = "/icons/128.png";
const BADGE_MAX = 99;

// The id carries what a click needs, since the worker that showed the
// notification may have stopped by then: the chat to open and the window
// to open the side panel in (the last focused one when it was shown).
export function notificationId(
  taskId: string,
  chatId?: string,
  windowId?: number,
) {
  return `${NOTIFICATION_PREFIX}${taskId}:${chatId || ""}:${windowId ?? ""}`;
}

export function parseNotificationId(id: string) {
  if (!id.startsWith(NOTIFICATION_PREFIX)) return undefined;
  const [taskId, chatId, windowText] = id
    .slice(NOTIFICATION_PREFIX.length)
    .split(":");
  const windowId = windowText ? Number(windowText) : undefined;
  return {
    taskId,
    chatId: chatId || undefined,
    windowId: Number.isInteger(windowId) ? windowId : undefined,
  };
}

async function lastFocusedWindowId() {
  return (
    await Promise.resolve()
      .then(() => getBrowserApi().windows?.getLastFocused())
      .catch(() => undefined)
  )?.id;
}

export async function notifyTask(
  task: ScheduledTask,
  notice: Notice,
  result: TaskResult,
) {
  const api = notificationsApi();
  if (!api) return;
  const t = getMessages(await storage.language.get()).tasks;
  const title = task.title || t.untitled;
  const message =
    notice === "needsOk"
      ? t.notify.needsOk
      : notice === "paused"
        ? t.notify.paused
        : notice === "needsUser"
          ? result.summary || t.notify.needsUser
          : result.summary ||
            (notice === "met" ? t.notify.conditionMet : t.notify.finished);
  const windowId = await lastFocusedWindowId();
  await api
    .create(notificationId(task.id, result.chatId, windowId), {
      type: "basic",
      iconUrl: getBrowserApi().runtime.getURL(ICON_PATH),
      title: `${t.notify.titlePrefix[notice]} · ${title}`,
      message,
    })
    .catch((error: unknown) =>
      console.warn("Failed to show a task notification", error),
    );
}

// The panel opens only during the click's gesture, before any await, in a
// known window: the notification's own, else the last focused one this
// worker saw. Without either, the panel opens where the browser can
// without a window (Firefox's sidebar; elsewhere the panel page in a tab,
// reusing an open one).
let focusedWindowId: number | undefined;

function trackFocusedWindow() {
  const windows = getBrowserApi().windows;
  if (!windows) return;
  windows
    .getLastFocused()
    .then((window) => (focusedWindowId ??= window.id))
    .catch(() => undefined);
  windows.onFocusChanged?.addListener((windowId) => {
    if (windowId !== windows.WINDOW_ID_NONE) focusedWindowId = windowId;
  });
}

// A click opens the run's chat in the side panel (the click is the user's
// gesture that lets the panel open), or the task list without a chat.
export function setupTaskNotificationClicks() {
  const api = notificationsApi();
  if (!api) return;
  trackFocusedWindow();
  api.onClicked.addListener((id) => {
    const parsed = parseNotificationId(id);
    if (!parsed) return;
    void api.clear(id).catch(() => undefined);
    handOffToSidePanel(
      { windowId: parsed.windowId ?? focusedWindowId } as chrome.tabs.Tab,
      parsed.chatId
        ? { task: SIDE_PANEL_TASK.openChat, chatId: parsed.chatId }
        : { task: SIDE_PANEL_TASK.openTasks },
    ).catch(console.warn);
  });
}

// The number of tasks whose result the user has not seen in the task list,
// or that wait for the user's OK on this device.
export function badgeCount(
  tasks: ScheduledTask[],
  states: TaskStates,
  context: RunContext,
) {
  return tasks.filter((task) => {
    const state = taskState(states, task.id);
    return state.unseen || idleReason(task, state, context) === "needsOk";
  }).length;
}

export async function updateTaskBadge() {
  const api = getBrowserApi();
  const action = api.action ?? api.browserAction;
  if (!action?.setBadgeText) return;
  const [tasks, states, context] = await Promise.all([
    storage.tasks.get(),
    storage.taskStates.get(),
    loadRunContext(),
  ]);
  const count = badgeCount(tasks, states, context);
  await action
    .setBadgeText({ text: count ? String(Math.min(count, BADGE_MAX)) : "" })
    .catch(() => undefined);
}
