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
  // Background -> page scripts.
  showForSelection: "smart-bar:show-for-selection",
  settingsChanged: "smart-bar:settings-changed",
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
  // Whether the selection is in a field (it decides the actions), not what
  // it says: nothing about the text leaves the page before an action.
  editable: boolean;
};

export type SmartBarPrepareResult = {
  // Whether selecting text with the mouse can show the bar in this frame:
  // false while the bar is off, shortcut-only or not allowed on the site,
  // so the page script stops asking until the settings change.
  onSelection: boolean;
  // Undefined when the bar must not show now.
  config?: SmartBarPageConfig;
};

// Sent to every tab when the smart bar settings change.
export type SmartBarSettingsChangedMessage = {
  type: typeof SMART_BAR_MESSAGE.settingsChanged;
  // False when no site can show the bar on selection any more.
  onSelection: boolean;
};

// What the page UI needs.
export type SmartBarPageConfig = {
  // For the selection's context; never empty.
  actions: SmartBarAction[];
  // What "Hide on this site" hides the bar on, for its label.
  hideSite: string;
  messages: SmartBarMessages;
  // The language of `messages`, for numbers in them.
  language: string;
  colorScheme: NonNullable<Preferences["colorScheme"]>;
  accentColor: NonNullable<Preferences["accentColor"]>;
};

export type SmartBarRunRequest = {
  type: "run";
  action: SmartBarGenerateAction;
  text: string;
  // Text around the selection and the page title, to understand it by.
  context?: { before: string; after: string; pageTitle?: string };
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
