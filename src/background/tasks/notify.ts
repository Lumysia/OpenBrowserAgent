import { getBrowserApi } from "../../shared/browser-api";
import { getMessages } from "../../shared/i18n";
import { storage } from "../../shared/storage";
import { SIDE_PANEL_TASK } from "../../shared/side-panel-handoff";
import type {
  ScheduledTask,
  TaskResult,
  TaskStates,
} from "../../shared/tasks/types";
import type { Notice } from "../../shared/tasks/lifecycle";
import { notificationsApi } from "../../shared/tasks/notifications";
import { handOffToSidePanel } from "../side-panel-handoff";

// System notifications for task results, where the browser has them
// (Chromium, Firefox; not Safari). The action badge and the task list show
// the same results everywhere.

const NOTIFICATION_PREFIX = "oba-task:";
const ICON_PATH = "/icons/128.png";
const BADGE_MAX = 99;

// The id carries the chat to open when the notification is clicked.
export function notificationId(taskId: string, chatId?: string) {
  return `${NOTIFICATION_PREFIX}${taskId}:${chatId || ""}`;
}

export function parseNotificationId(id: string) {
  if (!id.startsWith(NOTIFICATION_PREFIX)) return undefined;
  const [taskId, chatId] = id.slice(NOTIFICATION_PREFIX.length).split(":");
  return { taskId, chatId: chatId || undefined };
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
    notice === "paused"
      ? t.notify.paused
      : notice === "needsUser"
        ? result.summary || t.notify.needsUser
        : result.summary ||
          (notice === "met" ? t.notify.conditionMet : t.notify.finished);
  await api
    .create(notificationId(task.id, result.chatId), {
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
// known window: the last focused one is kept at hand.
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
      { windowId: focusedWindowId } as chrome.tabs.Tab,
      parsed.chatId
        ? { task: SIDE_PANEL_TASK.openChat, chatId: parsed.chatId }
        : { task: SIDE_PANEL_TASK.openTasks },
    ).catch(console.warn);
  });
}

// The number of tasks whose result the user has not seen in the task list.
export function unseenCount(states: TaskStates) {
  return Object.values(states).filter((state) => state.unseen).length;
}

export async function updateTaskBadge(states: TaskStates) {
  const api = getBrowserApi();
  const action = api.action ?? api.browserAction;
  if (!action?.setBadgeText) return;
  const count = unseenCount(states);
  await action
    .setBadgeText({ text: count ? String(Math.min(count, BADGE_MAX)) : "" })
    .catch(() => undefined);
}
