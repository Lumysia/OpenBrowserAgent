// Messages between the smart bar page scripts, the background and the side
// panel. Dependency-free (types only) for the page scripts.
import type { LocaleMessages } from "./locales/en-US";
import type { Preferences } from "./types";
import type { SmartBarAction, SmartBarGenerateAction } from "./smart-bar";

export const SMART_BAR_MESSAGE = {
  // Page script -> background.
  prepare: "smart-bar:prepare",
  hideOnSite: "smart-bar:hide-on-site",
  turnOff: "smart-bar:turn-off",
  openSidePanel: "smart-bar:open-side-panel",
  // Background -> page script (keyboard command).
  showForSelection: "smart-bar:show-for-selection",
} as const;

export const SMART_BAR_STREAM_PORT = "smart-bar-stream";

// Bundled page scripts, as built by WXT (`registration: "runtime"`).
export const SMART_BAR_SCRIPT = {
  trigger: "content-scripts/smart-bar.js",
  ui: "content-scripts/smart-bar-ui.js",
} as const;

export const SMART_BAR_COMMAND = "smart-bar";

export const SMART_BAR_HANDOFF_KEY = "smart-bar-handoff";

export type SmartBarMessages = LocaleMessages["smartBar"];

export type SmartBarShowReason = "selection" | "shortcut";

export type SmartBarPrepareRequest = {
  type: typeof SMART_BAR_MESSAGE.prepare;
  reason: SmartBarShowReason;
  uiLoaded: boolean;
};

// What the page UI needs; undefined when the bar must not show.
export type SmartBarPageConfig = {
  pageActions: SmartBarAction[];
  editActions: SmartBarAction[];
  messages: SmartBarMessages;
  colorScheme: NonNullable<Preferences["colorScheme"]>;
  accentColor: NonNullable<Preferences["accentColor"]>;
};

export type SmartBarRunRequest = {
  type: "run";
  action: SmartBarGenerateAction;
  text: string;
};

export type SmartBarStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

// Selection (and a result) the side panel picks up when it opens.
export type SmartBarHandoff = {
  id: string;
  windowId?: number;
  text: string;
  pageTitle?: string;
  pageUrl?: string;
  result?: { action: SmartBarGenerateAction; text: string };
  createdAt: number;
};

export type SmartBarOpenSidePanelRequest = {
  type: typeof SMART_BAR_MESSAGE.openSidePanel;
  text: string;
  result?: SmartBarHandoff["result"];
};
