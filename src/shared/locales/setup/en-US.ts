// First run (the guided setup and the side panel's setup card), joining
// sync from another device, and unlocking synced keys.
export const setupEnUS = {
  title: "Set up OpenBrowserAgent",
  description: "Add an AI provider to start chatting.",
  continueSetup: "Continue setup",
  openedSettings:
    "Setup is open in another tab. Come back here when you’re done.",
  welcomeTitle: "Welcome to OpenBrowserAgent",
  runAgain: "Run setup again",
  // The progress dots: {current} and {total} are numbers, {step} its name.
  progressLabel: "Setup steps",
  progressStep: "Step {current} of {total}: {step}",
  steps: {
    language: "Language",
    provider: "AI provider",
    pages: "On web pages",
    done: "Done",
  },
  back: "Back",
  next: "Next",
  skipStep: "Skip",
  languageTitle: "Choose your languages",
  languageDescription:
    "The extension’s language, and the language pages are translated into. Most people keep both as they are.",
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
