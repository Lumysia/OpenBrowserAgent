import { resolveAgent } from "../../shared/agents";
import { getMessages } from "../../shared/i18n";
import {
  hideSmartBarOnHost,
  isSmartBarAllowedOnHost,
  normalizeSmartBarSettings,
  SMART_BAR_TRIGGER,
  smartBarActions,
  smartBarHideSite,
  smartBarTextTooLong,
  type SmartBarSettings,
} from "../../shared/smart-bar";
import {
  SMART_BAR_COMMAND,
  SMART_BAR_MESSAGE,
  SMART_BAR_STREAM_PORT,
  type SmartBarHandoff,
  type SmartBarOpenSidePanelRequest,
  type SmartBarPageConfig,
  type SmartBarPrepareRequest,
  type SmartBarPrepareResult,
  type SmartBarRunRequest,
  type SmartBarSettingsChangedMessage,
  type SmartBarStreamEvent,
} from "../../shared/smart-bar-protocol";
import { smartBarHandoffStorage } from "../../shared/smart-bar-handoff";
import { getBrowserApi, storage } from "../../shared/storage";
import { openSidePanel } from "../action-surface";
import { resolveModel } from "../model-resolver";
import { requestText } from "../pi-provider";
import { smartBarPrompt } from "./prompts";
import {
  injectTrigger,
  injectUi,
  pageHost,
  syncSmartBarRegistration,
} from "./registration";

type Sender = chrome.runtime.MessageSender;

export function setupSmartBar() {
  let registration = Promise.resolve();
  const sync = (settings: SmartBarSettings) => {
    registration = registration
      .then(() => syncSmartBarRegistration(settings))
      .catch((error) => console.warn("Smart bar registration failed", error));
  };
  void readSettings().then(sync);
  // The first change after the worker starts is always announced: the
  // settings it read at startup may already be the changed ones.
  let announced: string | undefined;
  storage.preferences.watch((preferences) => {
    const settings = normalizeSmartBarSettings(preferences.smartBar);
    sync(settings);
    const key = JSON.stringify(settings);
    if (key === announced) return;
    announced = key;
    void announceSettings(settings);
  });

  chrome.commands?.onCommand.addListener((command, tab) => {
    if (command === SMART_BAR_COMMAND && tab?.id) void showForSelection(tab.id);
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === SMART_BAR_STREAM_PORT) handleStreamPort(port);
  });
}

// Smart bar page messages; false for other messages.
export function handleSmartBarMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (response: unknown) => void,
) {
  const request = (message || {}) as { type?: string };
  switch (request.type) {
    case SMART_BAR_MESSAGE.prepare:
      respond(prepare(request as SmartBarPrepareRequest, sender), sendResponse);
      return true;
    case SMART_BAR_MESSAGE.hideOnSite:
      respond(
        updateSettings((settings) => {
          const host = siteHost(sender);
          return host ? hideSmartBarOnHost(settings, host) : settings;
        }),
        sendResponse,
      );
      return true;
    case SMART_BAR_MESSAGE.turnOff:
      respond(
        updateSettings((settings) => ({ ...settings, enabled: false })),
        sendResponse,
      );
      return true;
    case SMART_BAR_MESSAGE.openSidePanel:
      respond(
        handOff(request as SmartBarOpenSidePanelRequest, sender),
        sendResponse,
      );
      return true;
    default:
      return false;
  }
}

function respond(
  work: Promise<unknown>,
  sendResponse: (response: unknown) => void,
) {
  work.then(
    (value) => sendResponse({ ok: true, value }),
    (error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
}

async function readSettings() {
  return normalizeSmartBarSettings((await storage.preferences.get()).smartBar);
}

function updateSettings(
  change: (settings: SmartBarSettings) => SmartBarSettings,
) {
  return storage.preferences.update((preferences) => ({
    ...preferences,
    smartBar: change(normalizeSmartBarSettings(preferences.smartBar)),
  }));
}

// Site rules follow the site the user is looking at: the tab's top-level
// host, also for selections in its frames. A blocked site's embeds get no bar,
// and "Hide on this site" in an embed hides it on that site, not on every site
// using the embed.
function siteHost(sender: Sender) {
  return pageHost(sender.tab?.url);
}

// Page scripts in open tabs stop or resume asking on mouseup.
async function announceSettings(settings: SmartBarSettings) {
  const message: SmartBarSettingsChangedMessage = {
    type: SMART_BAR_MESSAGE.settingsChanged,
    onSelection:
      settings.enabled && settings.trigger === SMART_BAR_TRIGGER.selection,
  };
  const api = getBrowserApi();
  const tabs = await api.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? undefined
        : api.tabs.sendMessage(tab.id, message).catch(() => undefined),
    ),
  );
}

// Whether this frame may show the bar now, and what it shows. Loads the bar's
// UI into the frame the first time. Nothing about the selection is sent.
async function prepare(
  request: SmartBarPrepareRequest,
  sender: Sender,
): Promise<SmartBarPrepareResult> {
  const [preferences, language] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
  ]);
  const settings = normalizeSmartBarSettings(preferences.smartBar);
  const host = siteHost(sender);
  const tabId = sender.tab?.id;
  const allowed =
    settings.enabled && !!host && isSmartBarAllowedOnHost(settings, host);
  const onSelection =
    allowed && settings.trigger === SMART_BAR_TRIGGER.selection;
  if (
    !host ||
    !allowed ||
    tabId === undefined ||
    (request.reason === "selection" && !onSelection)
  )
    return { onSelection };
  if (!request.uiLoaded) await injectUi(tabId, sender.frameId ?? 0);
  const config: SmartBarPageConfig = {
    pageActions: smartBarActions(settings, false),
    editActions: smartBarActions(settings, true),
    hideSite: smartBarHideSite(settings, host),
    messages: getMessages(language).smartBar,
    colorScheme: preferences.colorScheme || "system",
    accentColor: preferences.accentColor || "pink",
  };
  return { onSelection, config };
}

async function showForSelection(tabId: number) {
  if (!(await readSettings()).enabled) return;
  const message = { type: SMART_BAR_MESSAGE.showForSelection };
  const api = getBrowserApi();
  const sent = await api.tabs.sendMessage(tabId, message).then(
    () => true,
    () => false,
  );
  // Pages opened before the smart bar was turned on have no page script.
  if (!sent && (await injectTrigger(tabId)))
    await api.tabs.sendMessage(tabId, message).catch(() => undefined);
}

// Opens the side panel first (it needs the click's user gesture), then leaves
// the selection where the panel picks it up.
function handOff(request: SmartBarOpenSidePanelRequest, sender: Sender) {
  const windowId = sender.tab?.windowId;
  const opened = new Promise((resolve) =>
    resolve(openSidePanel(windowId)),
  ).catch((error) => console.warn("Failed to open the side panel", error));
  const handoff: SmartBarHandoff = {
    id: crypto.randomUUID(),
    windowId,
    text: request.text,
    pageTitle: sender.tab?.title,
    pageUrl: sender.tab?.url,
    result: request.result,
    createdAt: Date.now(),
  };
  const { area, key } = smartBarHandoffStorage();
  return Promise.all([opened, area.set({ [key]: handoff })]).then(
    () => undefined,
  );
}

function handleStreamPort(port: chrome.runtime.Port) {
  const controller = new AbortController();
  const post = (event: SmartBarStreamEvent) => {
    if (!controller.signal.aborted) port.postMessage(event);
  };
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((request: SmartBarRunRequest) => {
    if (request.type !== "run") return;
    runAction(request, controller.signal, post)
      .then(() => post({ type: "done" }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        post({
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });
}

async function runAction(
  request: SmartBarRunRequest,
  signal: AbortSignal,
  post: (event: SmartBarStreamEvent) => void,
) {
  const [preferences, agents, language] = await Promise.all([
    storage.preferences.get(),
    storage.agents.get(),
    storage.language.get(),
  ]);
  // The bar refuses these itself; never cut them here.
  if (smartBarTextTooLong(request.text))
    throw new Error(getMessages(language).smartBar.selectionTooLong);
  const settings = normalizeSmartBarSettings(preferences.smartBar);
  const agent = resolveAgent(agents, preferences.selectedAgentId);
  const model = await resolveModel(settings.modelId, agent.modelId);
  const uiLanguage = getBrowserApi().i18n?.getUILanguage?.() || "en-US";
  await requestText(
    model,
    smartBarPrompt(request.action, request.text, uiLanguage),
    signal,
    (text) => post({ type: "delta", text }),
  );
}
