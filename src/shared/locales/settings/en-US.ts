// The settings pages as grouped: their names, tabs and the shared groups on
// General (keyboard shortcuts, chat behavior) and the models table.
export const settingsEnUS = {
  providersModels: "AI providers & models",
  agentsSkills: "Agents & skills",
  onPages: "On pages",
  advanced: "Advanced",
  // Tabs.
  translate: "Translate",
  rightClick: "Right-click menu",
  troubleshooting: "Troubleshooting",
  shortcuts: "Keyboard shortcuts",
  shortcutsDescription:
    "Shortcuts for OpenBrowserAgent’s commands. The browser keeps them; change them in its shortcut settings.",
  shortcutNone: "Not set",
  changeShortcuts: "Change shortcuts",
  // Where the browser has no page to open for it.
  shortcutsFirefoxHint:
    'To change them, open about:addons, click the gear button and choose "Manage Extension Shortcuts".',
  // The toolbar button's command, which has no description of its own.
  openSidePanelCommand: "Open the side panel",
  // One command's keys, with a button to change them.
  commandShortcut: {
    // {shortcut}: the keys, as the browser shows them.
    current: "Shortcut: {shortcut}",
    none: "No shortcut set",
    change: "Change shortcut",
  },
  chatBehavior: "Chat behavior",
  chatBehaviorDescription:
    "Scrolling, retries, tool steps and holiday touches in the side panel.",
  models: "Models",
  modelsDescription:
    "Which model each feature uses. Each one uses the chat model unless you pick another.",
  modelChat: "Chat",
  modelHelper: "Helper",
  modelSmartBar: "Smart bar",
  modelTranslation: "Translation",
  modelImages: "Images",
  translateMenuItems: "Right-click menu items",
  translateMenuItemsDescription:
    "Translation entries in the right-click menu. The menu itself is turned on or off under Right-click menu.",
};
export type SettingsMessages = typeof settingsEnUS;
