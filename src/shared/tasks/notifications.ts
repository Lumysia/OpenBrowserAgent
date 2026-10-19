import { getBrowserApi } from "../browser-api";

// System notifications, where the browser has them: Chromium and Firefox
// do, Safari does not (results then show only on the toolbar button and in
// the task list).
export type NotificationsApi = {
  create(id: string, options: Record<string, unknown>): Promise<string>;
  onClicked: { addListener(listener: (id: string) => void): void };
  clear(id: string): Promise<boolean>;
};

export function notificationsApi() {
  return (getBrowserApi() as { notifications?: NotificationsApi })
    .notifications;
}

export function notificationsAvailable() {
  return typeof notificationsApi()?.create === "function";
}
