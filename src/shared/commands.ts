import { SIDE_PANEL_SHORTCUT } from "./config";
import type { Messages } from "./i18n";
import { PAGE_TRANSLATE_COMMAND } from "./page-translate/protocol";
import { SMART_BAR_COMMAND } from "./smart-bar-protocol";

// The toolbar button's command (Manifest V3; WXT names it
// `_execute_browser_action` in a Manifest V2 build).
export const ACTION_COMMAND = "_execute_action";
export const ACTION_COMMANDS = [ACTION_COMMAND, "_execute_browser_action"];

// The manifest's commands. Their descriptions are what the browser's own
// shortcut settings show, in the browser's language.
export const MANIFEST_COMMANDS = {
  [ACTION_COMMAND]: {
    suggested_key: { ...SIDE_PANEL_SHORTCUT },
    description: "OpenBrowserAgent",
  },
  // No default key: the user picks one in the browser's shortcut settings.
  [SMART_BAR_COMMAND]: {
    description: "__MSG_smartBarCommand__",
  },
  // Alt+A is free in Chrome, Edge and Firefox. On macOS Option+A types "å"
  // (a command takes its keys from every text field), so Control+Shift+A
  // there.
  [PAGE_TRANSLATE_COMMAND]: {
    suggested_key: { default: "Alt+A", mac: "MacCtrl+Shift+A" },
    description: "__MSG_translatePageCommand__",
  },
};

type SettingsText = {
  [Key in keyof Messages["settings"]]: Messages["settings"][Key] extends string
    ? Key
    : never;
}[keyof Messages["settings"]];

// Each command's title in the extension's own UI language (the browser
// would give its description in the browser's language).
export const COMMAND_TITLES: Record<string, SettingsText> = {
  [ACTION_COMMAND]: "openSidePanelCommand",
  _execute_browser_action: "openSidePanelCommand",
  [SMART_BAR_COMMAND]: "smartBarCommand",
  [PAGE_TRANSLATE_COMMAND]: "translatePageCommand",
};

// A command's title; the browser's description for one not in the table.
export function commandTitle(
  command: { name: string; description: string },
  t: Messages,
) {
  const key = COMMAND_TITLES[command.name];
  return key ? t.settings[key] : command.description || command.name;
}

// The side panel's suggested keys on this platform, for a hint where none
// is set.
export function suggestedSidePanelKeys(platform: string) {
  return /mac/i.test(platform)
    ? SIDE_PANEL_SHORTCUT.mac
    : SIDE_PANEL_SHORTCUT.default;
}
