import { plural } from "../../plural";

// The downloads tool's step lines in the side panel.
export const downloadsEnUS = {
  // The step title: what came of the download(s), once the step is done.
  titles: {
    downloaded: "Downloaded",
    saved: "Saved",
    failed: "Download failed",
    downloading: "Downloading",
    paused: "Download paused",
    waiting: "Waiting for you",
    canceled: "Canceled",
    listed: "Listed downloads",
    noneStarted: "No download started",
  },
  // The step title while it runs, by action.
  running: {
    download: "Downloading",
    save: "Saving",
    images: "Saving images",
    list: "Checking downloads",
    wait: "Waiting for a download",
    cancel: "Canceling download",
    retry: "Retrying download",
  },
  status: {
    completed: "{name} · {size}",
    failed: "{name}: {reason}",
    canceled: "{name}",
    in_progress: "{name} · {progress}",
    paused: "{name} · {progress}",
    needs_confirmation:
      "The browser is holding {name}: keep it in the browser's downloads list",
    choosing_location:
      "Choose where to save {name} in the browser's Save dialog",
  },
  moved: "{name} was moved or deleted",
  htmlPage: "{name} is a web page, not the file",
  reasons: {
    network: "network error",
    missing: "the file isn't on the server",
    denied: "the server refused access",
    signIn: "sign-in required",
    disk: "the file couldn't be written",
    blocked: "blocked by the browser",
    other: "download error",
  },
  listed: plural({ one: "{count} download", other: "{count} downloads" }),
  none: "No downloads",
  showFileInFolder: "Show {name} in its folder",
};

export type DownloadsLocaleMessages = typeof downloadsEnUS;
