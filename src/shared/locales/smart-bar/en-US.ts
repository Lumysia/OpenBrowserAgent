export const smartBarEnUS = {
  barLabel: "Smart bar",
  actions: {
    ask: "Ask",
    explain: "Explain",
    translate: "Translate",
    summarize: "Summarize",
    copy: "Copy",
    improve: "Improve writing",
    fixGrammar: "Fix spelling & grammar",
  },
  copied: "Copied",
  closeMenu: "Smart bar options",
  hideOnSite: "Hide on {site}",
  turnOff: "Turn off smart bar",
  close: "Close",
  stop: "Stop",
  retry: "Retry",
  replace: "Replace",
  insertBelow: "Insert below",
  continueInSidePanel: "Continue in side panel",
  writing: "Writing…",
  emptyResult: "The model returned no text.",
  selectionChanged: "The selected text changed. Copy the result instead.",
  selectionTooLong:
    "The selection is too long (over {max} characters). Continue in the side panel instead.",
  settingsTitle: "Smart bar",
  settingsDescription:
    "A small toolbar next to selected text with quick AI actions. Nothing is sent until you pick an action.",
  enable: "Show the smart bar",
  enableDescription:
    "Off by default. When on, OpenBrowserAgent watches text selection on allowed pages.",
  trigger: "When to show",
  triggerDescription:
    "The keyboard shortcut works in both modes. Set it in your browser's extension shortcut settings.",
  triggerSelection: "When text is selected",
  triggerShortcut: "Only with the shortcut",
  sites: "Sites",
  sitesDescription:
    "Both lists are kept; the mode decides which one applies. A site includes its subdomains.",
  siteModeBlockList: "Everywhere except blocked sites",
  siteModeAllowList: "Only on allowed sites",
  blockedSites: "Blocked sites",
  allowedSites: "Allowed sites",
  sitePlaceholder: "example.com",
  addSite: "Add site",
  removeSite: "Remove {host}",
  invalidSite: "Enter a site such as example.com.",
  noSites: "No sites yet.",
  pageActions: "Actions for page text",
  pageActionsDescription: "Shown when you select text on a page.",
  editActions: "Actions for text you are editing",
  editActionsDescription:
    "Shown when you select text in a text field. Results can replace the selection.",
  model: "Smart bar model",
  modelDescription:
    "Model for Explain, Translate, Summarize and the writing actions.",
  modelSameAsAgent: "Same as agent model",
};

export type SmartBarLocaleMessages = typeof smartBarEnUS;
