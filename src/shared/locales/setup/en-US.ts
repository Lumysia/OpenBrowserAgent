import { plural } from "../../plural";

// First run (the guided setup), joining sync from another device, and
// unlocking synced keys.
export const setupEnUS = {
  continueSetup: "Continue setup",
  welcomeTitle: "Welcome to OpenBrowserAgent",
  runAgain: "Run setup again",
  // The progress dots: {current} and {total} are numbers, {step} its name.
  progressLabel: "Setup steps",
  progressStep: "Step {current} of {total}: {step}",
  steps: {
    language: "Language",
    path: "New or returning",
    provider: "AI provider",
    pages: "On web pages",
    sync: "Sync",
    passphrase: "Sync passphrase",
    download: "Download",
    done: "Done",
  },
  back: "Back",
  next: "Next",
  skipStep: "Skip",
  languageTitle: "Choose your languages",
  languageDescription:
    "The extension’s language, and the language pages are translated into. Most people keep both as they are.",
  pathTitle: "Have you used OpenBrowserAgent before?",
  pathDescription:
    "If you use it on another device, sync brings your AI providers, agents and chats here.",
  pathNew: "First time here",
  pathNewDescription:
    "Connect an AI provider and choose what OpenBrowserAgent adds to web pages.",
  pathReturning: "I use it on another device",
  pathReturningDescription:
    "Sync your settings, AI providers and chats from your other device.",
  syncTitle: "Choose how to sync",
  syncDescription: "Connect the same way as on your other device.",
  recommended: "Recommended",
  methodCode: "Paste a sync code",
  methodCodeDescription: "One code holds the sync server and what syncs.",
  methodBrowser: "Browser account sync",
  browserConnect: "Turn on browser account sync",
  tryAgain: "Try again",
  asNewUser: "Set up as a new user",
  passphraseTitle: "Enter your sync passphrase",
  passphraseDescription:
    "Your API keys are synced encrypted. Enter the passphrase you set on your other device.",
  keysUnlocked: "Your API keys are unlocked.",
  downloadTitle: "Connect and download",
  downloadDescription:
    "OpenBrowserAgent downloads what your other device synced.",
  downloading: "Downloading…",
  downloadFailed: "Couldn’t download from the sync server.",
  arrived: "From your other device:",
  noSyncedProvider:
    "No AI provider came from your other device. Chat needs one.",
  arrivedCount: {
    providers: plural({
      one: "{count} AI provider",
      other: "{count} AI providers",
    }),
    agents: plural({ one: "{count} agent", other: "{count} agents" }),
    skills: plural({ one: "{count} skill", other: "{count} skills" }),
    mcpServers: plural({
      one: "{count} MCP server",
      other: "{count} MCP servers",
    }),
    chats: plural({ one: "{count} chat", other: "{count} chats" }),
  },
  providerTitle: "Connect an AI provider",
  providerDescription:
    "Chat and the agent need an AI provider. Pick a service, or any OpenAI- or Anthropic-compatible server with its Base URL.",
  providerPlaceholder: "Choose an AI provider",
  // {name}: the AI provider's name.
  providerReady: "{name} is ready. Press Next to go on.",
  testConnection: "Test connection",
  testingConnection: "Testing…",
  // {model}: the model's name.
  connectionOk: "Connected. {model} answered.",
  connectionFailed: "Couldn’t connect to the AI provider",
  modelFailed: "Connected, but {model} didn’t answer",
  noModelsListed:
    "Connected, but the AI provider listed no models. Enter a model name.",
  model: "Model",
  modelName: "Model name",
  modelNameHint:
    "If the AI provider doesn’t list its models, enter one by name, then test again.",
  pagesTitle: "On web pages",
  pagesDescription:
    "What OpenBrowserAgent adds to the pages you visit. You can change these later in Settings → On pages.",
  translateButtonDescription:
    "A small button on the edge of a page translates it or shows the original.",
  smartBarTitle: "Smart bar on selected text",
  smartBarDescription:
    "Quick actions next to text you select. Nothing is sent until you pick one.",
  subtitlesDescription:
    "Videos with subtitles show each line with its translation under it.",
  doneTitle: "You’re all set",
  doneDescription:
    "Open the side panel and ask about the page you’re on. These keys work on any page.",
  noProviderNote:
    "Chat needs an AI provider. Page translation with the browser’s translator works without one.",
  openPanelDescription:
    "Pin OpenBrowserAgent from the browser’s Extensions menu, then click its icon to open the side panel.",
  openPanel: "Open side panel",
  code: "Sync code",
  // {settings} → {sync}: the settings page; {button}: its button's label.
  codeDescription:
    "On your other device, open {settings} → {sync} and press “{button}”. The code’s sync choices replace this device’s.",
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
  unlocking: "Unlocking…",
  skip: "Skip for now",
};
export type SetupMessages = typeof setupEnUS;
