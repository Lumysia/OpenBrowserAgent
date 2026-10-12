// Smart bar settings and site rules. Dependency-free: the page scripts import
// this module, so it must stay small.

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

// Actions in bar order. `generate` actions stream a result card; `ask` and
// `copy` act at once.
export const SMART_BAR_ACTION = {
  ask: "ask",
  explain: "explain",
  translate: "translate",
  summarize: "summarize",
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
  SMART_BAR_ACTION.summarize,
  SMART_BAR_ACTION.copy,
] as const satisfies readonly SmartBarAction[];

export const SMART_BAR_EDIT_ACTIONS = [
  SMART_BAR_ACTION.improve,
  SMART_BAR_ACTION.fixGrammar,
  SMART_BAR_ACTION.translate,
  SMART_BAR_ACTION.ask,
] as const satisfies readonly SmartBarAction[];

export type SmartBarGenerateAction = Exclude<
  SmartBarAction,
  typeof SMART_BAR_ACTION.ask | typeof SMART_BAR_ACTION.copy
>;

export function isGenerateAction(
  action: SmartBarAction,
): action is SmartBarGenerateAction {
  return action !== SMART_BAR_ACTION.ask && action !== SMART_BAR_ACTION.copy;
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
  // Canvas-rendered: the page selection is empty there.
  blockedHosts: ["docs.google.com"],
  allowedHosts: [],
  disabledPageActions: [],
  disabledEditActions: [],
  modelId: "",
};

export function normalizeSmartBarSettings(
  value: Partial<SmartBarSettings> | undefined,
): SmartBarSettings {
  const merged = { ...DEFAULT_SMART_BAR_SETTINGS, ...value };
  const actions = new Set<string>(Object.values(SMART_BAR_ACTION));
  const actionList = (list: unknown) =>
    Array.isArray(list)
      ? (list.filter((item) => actions.has(item)) as SmartBarAction[])
      : [];
  return {
    enabled: merged.enabled === true,
    trigger: Object.values(SMART_BAR_TRIGGER).includes(merged.trigger)
      ? merged.trigger
      : DEFAULT_SMART_BAR_SETTINGS.trigger,
    siteMode: Object.values(SMART_BAR_SITE_MODE).includes(merged.siteMode)
      ? merged.siteMode
      : DEFAULT_SMART_BAR_SETTINGS.siteMode,
    blockedHosts: hostList(merged.blockedHosts),
    allowedHosts: hostList(merged.allowedHosts),
    disabledPageActions: actionList(merged.disabledPageActions),
    disabledEditActions: actionList(merged.disabledEditActions),
    modelId: typeof merged.modelId === "string" ? merged.modelId : "",
  };
}

function hostList(list: unknown) {
  if (!Array.isArray(list)) return [];
  const hosts = list.map((item) => normalizeHost(String(item)));
  return [...new Set(hosts.filter((host): host is string => !!host))];
}

// A host as typed or pasted ("https://www.example.com/path", "Example.com")
// to "www.example.com"; undefined when it is not a host name.
export function normalizeHost(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  let host = text;
  try {
    host = new URL(text.includes("://") ? text : `http://${text}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^\*\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) ? host : undefined;
}

// A listed host covers its subdomains.
export function hostMatches(host: string, listed: string) {
  return host === listed || host.endsWith(`.${listed}`);
}

export function isSmartBarAllowedOnHost(
  settings: SmartBarSettings,
  host: string,
) {
  const listed = (list: string[]) =>
    list.some((entry) => hostMatches(host, entry));
  return settings.siteMode === SMART_BAR_SITE_MODE.allowList
    ? listed(settings.allowedHosts)
    : !listed(settings.blockedHosts);
}

// "Hide on this site": block the host, or in allow-list mode drop every
// allowed entry that covers it.
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

// Where the page script is registered; undefined when it runs nowhere.
// Pages already open are checked again by the background on each selection.
export function smartBarMatchPatterns(settings: SmartBarSettings) {
  if (!settings.enabled) return undefined;
  const patterns = (hosts: string[]) => hosts.map((host) => `*://*.${host}/*`);
  if (settings.siteMode === SMART_BAR_SITE_MODE.allowList)
    return settings.allowedHosts.length
      ? { matches: patterns(settings.allowedHosts), excludeMatches: [] }
      : undefined;
  return {
    matches: ["http://*/*", "https://*/*"],
    excludeMatches: patterns(settings.blockedHosts),
  };
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
