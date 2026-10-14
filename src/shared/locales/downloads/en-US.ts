import { plural } from "../../plural";

// The downloads tool's step lines in the side panel.
export const downloadsEnUS = {
  status: {
    completed: "Saved {name} · {size}",
    failed: "Couldn't download {name}: {reason}",
    canceled: "Canceled {name}",
    in_progress: "Downloading {name} · {progress}",
    paused: "Paused {name} · {progress}",
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
