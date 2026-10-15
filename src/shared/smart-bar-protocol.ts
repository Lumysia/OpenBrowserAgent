// Messages between the smart bar page scripts, the background and the side
// panel. Dependency-free (types only) for the page scripts.
import type { LocaleMessages } from "./locales/en-US";
import type { Preferences } from "./types";
import type { SidePanelHandoffRequest } from "./side-panel-handoff";
import type { SmartBarAction, SmartBarGenerateAction } from "./smart-bar";

export const SMART_BAR_MESSAGE = {
  // Page script -> background.
  prepare: "smart-bar:prepare",
  hideOnSite: "smart-bar:hide-on-site",
  turnOff: "smart-bar:turn-off",
  openSidePanel: "smart-bar:open-side-panel",
  allowProvider: "smart-bar:allow-provider",
  // Background -> page scripts.
  showForSelection: "smart-bar:show-for-selection",
  settingsChanged: "smart-bar:settings-changed",
} as const;

export const SMART_BAR_STREAM_PORT = "smart-bar-stream";

export const SMART_BAR_COMMAND = "smart-bar";

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
  // The question before a provider first receives the user's content.
  providerConsent: LocaleMessages["providerConsent"];
  // The language of `messages`, for numbers in them.
  language: string;
  // The language results are written in (the extension's language setting,
  // which `language` may only approximate).
  replyLanguage: string;
  colorScheme: NonNullable<Preferences["colorScheme"]>;
  accentColor: NonNullable<Preferences["accentColor"]>;
};

export type SmartBarRunRequest = {
  type: "run";
  action: SmartBarGenerateAction;
  text: string;
  // Text around the selection and the page title, to understand it by.
  context?: { before: string; after: string; pageTitle?: string };
  // Translate: the selected text's language (a BCP 47 tag) when the page
  // knows it; absent when only a guess was left.
  sourceLanguage?: string;
};

export type SmartBarStreamEvent =
  | { type: "delta"; text: string }
  // The model is thinking before it answers.
  | { type: "thinking" }
  | { type: "done" }
  | { type: "error"; error: string }
  // Nothing was sent: the provider needs the user's permission first.
  | { type: "consent"; providerId: string; host: string };

// What the bar's side panel actions hand over: the selection to ask about,
// to search the web about, or with a result to continue.
export type SmartBarSidePanelRequest = Extract<
  SidePanelHandoffRequest,
  { task: "ask" | "searchWeb" | "continue" }
>;

// The user agreed in the bar that the provider may receive their content
// at `host` (the host they were shown).
export type SmartBarAllowProviderRequest = {
  type: typeof SMART_BAR_MESSAGE.allowProvider;
  providerId: string;
  host: string;
};

export type SmartBarOpenSidePanelRequest = {
  type: typeof SMART_BAR_MESSAGE.openSidePanel;
  request: SmartBarSidePanelRequest;
};
