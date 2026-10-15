// First run (the setup page and the side panel's setup card), joining sync
// from another device, and unlocking synced keys.
export const setupEnUS = {
  title: "Set up OpenBrowserAgent",
  description: "Add an AI provider to start chatting.",
  openedSettings:
    "Settings is open. Add an AI provider there, then come back here.",
  welcomeTitle: "Welcome to OpenBrowserAgent",
  welcomeDescription:
    "Add an AI provider and a model, then open the side panel and ask about the page you’re on.",
  openPanelTitle: "Open the side panel",
  openPanelDescription:
    "Pin OpenBrowserAgent from the browser’s Extensions menu, then click its icon to open the side panel.",
  openPanel: "Open side panel",
  joinLink: "Already use OpenBrowserAgent on another device? Paste a sync code",
  codeTab: "Paste code",
  manualTab: "Manual setup",
  code: "Sync code",
  codeDescription:
    "Copy it on your other device under Settings → Sync. The code’s sync choices replace this device’s.",
  codeInvalid:
    "This isn’t a valid sync code. Copy it again and paste the whole code.",
  connect: "Connect and sync",
  testing: "Connecting…",
  pulling: "Syncing…",
  failed:
    "Couldn’t connect. Check the code or the server details and try again.",
  connected: "Connected. Your settings are syncing.",
  keysLocked:
    "Your API keys are synced but locked. Enter your sync passphrase.",
  unlock: "Unlock",
  skip: "Skip for now",
};
export type SetupMessages = typeof setupEnUS;
