// Smart bar settings and site rules. Dependency-free: the page scripts import
// this module, so it must stay small.
import { primaryLanguage } from "./language-tags";
import {
  hostListed,
  hostMatches,
  hostMatchPattern,
  normalizeHostList,
  webPagesExcept,
  type SiteMatchPatterns,
} from "./site-hosts";
import { knownValues, oneOf } from "./values";

export const SMART_BAR_TRIGGER = {
  selection: "selection",
  shortcut: "shortcut",
} as const;

export type SmartBarTrigger =
  (typeof SMART_BAR_TRIGGER)[keyof typeof SMART_BAR_TRIGGER];

export const SMART_BAR_SITE_MODE = {
  blockList: "blockList",
  allowList: "allowList",
} as const;

export type SmartBarSiteMode =
  (typeof SMART_BAR_SITE_MODE)[keyof typeof SMART_BAR_SITE_MODE];

// Actions in bar order. `generate` actions stream a result card; `ask`,
// `search` and `copy` act at once. Stored lists of turned-off actions drop
// names that are no longer here (such as the former "summarize").
export const SMART_BAR_ACTION = {
  ask: "ask",
  explain: "explain",
  translate: "translate",
  search: "search",
  copy: "copy",
  improve: "improve",
  fixGrammar: "fixGrammar",
} as const;

export type SmartBarAction =
  (typeof SMART_BAR_ACTION)[keyof typeof SMART_BAR_ACTION];

export const SMART_BAR_PAGE_ACTIONS = [
  SMART_BAR_ACTION.ask,
  SMART_BAR_ACTION.explain,
  SMART_BAR_ACTION.translate,
  SMART_BAR_ACTION.search,
  SMART_BAR_ACTION.copy,
] as const satisfies readonly SmartBarAction[];

export const SMART_BAR_EDIT_ACTIONS = [
  SMART_BAR_ACTION.improve,
  SMART_BAR_ACTION.fixGrammar,
  SMART_BAR_ACTION.translate,
  SMART_BAR_ACTION.ask,
] as const satisfies readonly SmartBarAction[];

// Translate answers in the target language ("Translate into"), or in this
// one when the text already is in the target language. The prompts ask for it; reading aloud
// expects it.
export const SMART_BAR_TRANSLATION_FALLBACK_LANGUAGE = "en";

export function smartBarTranslationLanguage(
  targetLanguage: string,
  sourceLanguage: string | undefined,
) {
  return sourceLanguage &&
    primaryLanguage(sourceLanguage) === primaryLanguage(targetLanguage)
    ? SMART_BAR_TRANSLATION_FALLBACK_LANGUAGE
    : targetLanguage;
}

export function isSmartBarTranslationFallback(targetLanguage: string) {
  return (
    primaryLanguage(targetLanguage) === SMART_BAR_TRANSLATION_FALLBACK_LANGUAGE
  );
}

// Longest selection the generate actions take. Longer ones are refused, not
// cut: Replace must never overwrite text the model didn't see.
export const SMART_BAR_MAX_TEXT_CHARS = 20_000;

export function smartBarTextTooLong(text: string) {
  return text.length > SMART_BAR_MAX_TEXT_CHARS;
}

const IMMEDIATE_ACTIONS = [
  SMART_BAR_ACTION.ask,
  SMART_BAR_ACTION.search,
  SMART_BAR_ACTION.copy,
] as const;

export type SmartBarGenerateAction = Exclude<
  SmartBarAction,
  (typeof IMMEDIATE_ACTIONS)[number]
>;

export function isGenerateAction(
  action: SmartBarAction,
): action is SmartBarGenerateAction {
  return !(IMMEDIATE_ACTIONS as readonly SmartBarAction[]).includes(action);
}

export type SmartBarSettings = {
  enabled: boolean;
  trigger: SmartBarTrigger;
  siteMode: SmartBarSiteMode;
  // Both lists are kept when the mode switches.
  blockedHosts: string[];
  allowedHosts: string[];
  // Turned-off actions, so actions added later show by default.
  disabledPageActions: SmartBarAction[];
  disabledEditActions: SmartBarAction[];
  // Empty: the agent's model, as in the side panel.
  modelId: string;
};

export const DEFAULT_SMART_BAR_SETTINGS: SmartBarSettings = {
  enabled: false,
  trigger: SMART_BAR_TRIGGER.selection,
  siteMode: SMART_BAR_SITE_MODE.blockList,
  // Pages that draw their text themselves (on a canvas) leave no shown
  // selection, so the bar doesn't open there without a site list.
  blockedHosts: [],
  allowedHosts: [],
  disabledPageActions: [],
  disabledEditActions: [],
  modelId: "",
};

export function normalizeSmartBarSettings(
  value: Partial<SmartBarSettings> | undefined,
): SmartBarSettings {
  const merged = { ...DEFAULT_SMART_BAR_SETTINGS, ...value };
  const actions: SmartBarAction[] = Object.values(SMART_BAR_ACTION);
  const actionList = (list: unknown) => knownValues(actions, list);
  return {
    enabled: merged.enabled === true,
    trigger: oneOf(
      Object.values(SMART_BAR_TRIGGER),
      merged.trigger,
      DEFAULT_SMART_BAR_SETTINGS.trigger,
    ),
    siteMode: oneOf(
      Object.values(SMART_BAR_SITE_MODE),
      merged.siteMode,
      DEFAULT_SMART_BAR_SETTINGS.siteMode,
    ),
    blockedHosts: normalizeHostList(merged.blockedHosts),
    allowedHosts: normalizeHostList(merged.allowedHosts),
    disabledPageActions: actionList(merged.disabledPageActions),
    disabledEditActions: actionList(merged.disabledEditActions),
    modelId: typeof merged.modelId === "string" ? merged.modelId : "",
  };
}

export function isSmartBarAllowedOnHost(
  settings: SmartBarSettings,
  host: string,
) {
  return settings.siteMode === SMART_BAR_SITE_MODE.allowList
    ? hostListed(settings.allowedHosts, host)
    : !hostListed(settings.blockedHosts, host);
}

// "Hide on this site": block the host, or in allow-list mode drop every
// allowed entry that covers it. The bar names the site this affects (see
// smartBarHideSite), since in allow-list mode that is the whole listed domain.
export function hideSmartBarOnHost(
  settings: SmartBarSettings,
  host: string,
): SmartBarSettings {
  if (settings.siteMode === SMART_BAR_SITE_MODE.allowList)
    return {
      ...settings,
      allowedHosts: settings.allowedHosts.filter(
        (entry) => !hostMatches(host, entry),
      ),
    };
  return settings.blockedHosts.includes(host)
    ? settings
    : { ...settings, blockedHosts: [...settings.blockedHosts, host] };
}

// The site "Hide on this site" hides the bar on: the host itself, or in
// allow-list mode the broadest allowed entry covering it.
export function smartBarHideSite(settings: SmartBarSettings, host: string) {
  if (settings.siteMode !== SMART_BAR_SITE_MODE.allowList) return host;
  const covering = settings.allowedHosts.filter((entry) =>
    hostMatches(host, entry),
  );
  return covering.sort((a, b) => a.length - b.length)[0] ?? host;
}

// Where the page script is registered; undefined when it runs nowhere.
// Pages already open are checked again by the background on each selection.
export function smartBarMatchPatterns(
  settings: SmartBarSettings,
): SiteMatchPatterns | undefined {
  if (!settings.enabled) return undefined;
  if (settings.siteMode === SMART_BAR_SITE_MODE.allowList)
    return settings.allowedHosts.length
      ? {
          matches: settings.allowedHosts.map(hostMatchPattern),
          excludeMatches: [],
        }
      : undefined;
  return webPagesExcept(settings.blockedHosts);
}

export function smartBarActions(
  settings: SmartBarSettings,
  editable: boolean,
): SmartBarAction[] {
  const disabled = editable
    ? settings.disabledEditActions
    : settings.disabledPageActions;
  return (editable ? SMART_BAR_EDIT_ACTIONS : SMART_BAR_PAGE_ACTIONS).filter(
    (action) => !disabled.includes(action),
  );
}
