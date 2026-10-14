// The downloads tool's results, as the side panel stores and shows them.

export const DOWNLOAD_ACTION = {
  download: "download",
  save: "save",
  images: "images",
  list: "list",
  wait: "wait",
  cancel: "cancel",
  retry: "retry",
} as const;

export type DownloadAction =
  (typeof DOWNLOAD_ACTION)[keyof typeof DOWNLOAD_ACTION];

// What became of a download, from the browser's state, danger and interrupt
// reason. The agent must not guess any of these.
export const DOWNLOAD_STATUS = {
  completed: "completed",
  failed: "failed",
  canceled: "canceled",
  inProgress: "in_progress",
  paused: "paused",
  // The browser holds a file it considers dangerous until the user keeps it.
  needsConfirmation: "needs_confirmation",
  // The browser's Save dialog is open: the user picks where it goes.
  choosingLocation: "choosing_location",
} as const;

export type DownloadStatus =
  (typeof DOWNLOAD_STATUS)[keyof typeof DOWNLOAD_STATUS];

export type DownloadRecord = {
  id: number;
  status: DownloadStatus;
  // The file name, without its folder.
  name: string;
  // The full path on this device, once the browser has chosen it.
  path?: string;
  url?: string;
  finalUrl?: string;
  referrer?: string;
  mime?: string;
  bytes?: number;
  totalBytes?: number;
  startTime?: string;
  endTime?: string;
  // The browser's interrupt reason, such as NETWORK_FAILED.
  error?: string;
  danger?: string;
  // False once the finished file was moved or deleted.
  exists?: boolean;
  // Started by this chat (by the downloads tool or a click of the agent).
  mine?: boolean;
  // Something about a finished file the user should know.
  warning?: string;
};

export function isFinishedDownload(status: DownloadStatus) {
  return (
    status === DOWNLOAD_STATUS.completed ||
    status === DOWNLOAD_STATUS.failed ||
    status === DOWNLOAD_STATUS.canceled
  );
}

// Outcomes only the user can move on.
export function needsUserForDownload(status: DownloadStatus) {
  return (
    status === DOWNLOAD_STATUS.needsConfirmation ||
    status === DOWNLOAD_STATUS.choosingLocation
  );
}

// Download records in a tool output; tolerant of anything stored.
export function downloadRecords(output: unknown): DownloadRecord[] {
  const value = (output as { downloads?: unknown } | undefined)?.downloads;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DownloadRecord =>
      !!item &&
      typeof item === "object" &&
      typeof (item as DownloadRecord).id === "number" &&
      typeof (item as DownloadRecord).status === "string",
  );
}
