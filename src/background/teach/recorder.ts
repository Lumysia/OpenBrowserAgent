import { getBrowserApi } from "../../shared/browser-api";
import { isScriptableUrl } from "../../shared/browser";
import { getMessages } from "../../shared/i18n";
import { PAGE_SCRIPT } from "../../shared/page-scripts";
import { storage } from "../../shared/storage";
import { USER_ERROR_CODE, UserError } from "../../shared/user-errors";
import { tabsInUse } from "../run-tab";
import { TEACH_PAGE_MESSAGE } from "../../shared/teach/messages";
import {
  TEACH_RECORDER_GLOBAL,
  type TeachPageConfig,
} from "../../shared/teach/page-protocol";
import { sessionOfTab, teachSessions } from "../../shared/teach/records";
import { addNavigation, addTeachStep } from "../../shared/teach/steps";
import {
  TEACH_LIMITS,
  TEACH_STATE,
  TEACH_STEP_KIND,
  type TeachEvent,
  type TeachSession,
  type TeachStart,
  type TeachStep,
  type TeachUnrecorded,
  TEACH_ENDED_BY,
  type TeachEndedBy,
} from "../../shared/teach/types";
import { pageTextOf } from "../../shared/teach/page-text";
import {
  mergeFingerprints,
  newFingerprintKey,
  redactStrings,
} from "../../shared/teach/redact";
import { cleanUrl, hostOf, urlPattern } from "../../shared/teach/urls";
import { pageToastTheme } from "../page-toast";

// The recordings of teach mode. A recording lives in storage.session by
// the tab it started in, so it survives navigations and a restarted
// service worker; the recorder (PAGE_SCRIPT.teachRecorder) is injected
// into each new document of a recorded tab. Steps arrive from the page;
// navigations, opened tabs and tab switches come from the browser here.

const IDLE_ALARM = "teach-idle";
const IDLE_CHECK_MINUTES = 1;

// Recordings that are still recording, by tab.
export async function recordingOfTab(tabId: number | undefined) {
  const session = sessionOfTab(await teachSessions.get(), tabId);
  return session?.state === TEACH_STATE.recording ? session : undefined;
}

// Changes the recording `tabId` belongs to; undefined when there is none.
export async function updateSession(
  tabId: number,
  change: (session: TeachSession) => TeachSession | undefined,
) {
  let result: TeachSession | undefined;
  await teachSessions.update((sessions) => {
    const session = sessionOfTab(sessions, tabId);
    if (!session) return sessions;
    const next = { ...sessions };
    result = change(session);
    if (result) next[String(session.tabId)] = result;
    else delete next[String(session.tabId)];
    return next;
  });
  return result;
}

async function pageConfig(tabId: number): Promise<TeachPageConfig> {
  const [preferences, language, sessions] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
    teachSessions.get(),
  ]);
  const messages = getMessages(language).teach.pill;
  const session = sessionOfTab(sessions, tabId);
  return {
    theme: pageToastTheme(preferences.colorScheme, preferences.accentColor),
    messages,
    typed: {
      key: session?.typedKey || "",
      fingerprints: session?.typed || [],
    },
  };
}

// Puts the recorder into the tab's top frame; false where the page can't
// be scripted.
async function injectRecorder(tabId: number) {
  const { scripting } = getBrowserApi();
  const target = { tabId, frameIds: [0] };
  try {
    await scripting.executeScript({
      target,
      files: [PAGE_SCRIPT.teachRecorder],
    });
    const [result] = await scripting.executeScript({
      target,
      func: callRecorder,
      args: [TEACH_RECORDER_GLOBAL, await pageConfig(tabId)],
    });
    return result?.result === true;
  } catch {
    return false;
  }
}

// Runs in the page (serialized, so self-contained).
function callRecorder(name: string, config: TeachPageConfig) {
  const start = (globalThis as Record<string, unknown>)[name];
  return typeof start === "function" ? start(config) === true : false;
}

function endRecorder(tabId: number) {
  return getBrowserApi()
    .tabs.sendMessage(tabId, { type: TEACH_PAGE_MESSAGE.end }, { frameId: 0 })
    .catch(() => undefined);
}

function armIdleCheck() {
  return getBrowserApi().alarms?.create(IDLE_ALARM, {
    periodInMinutes: IDLE_CHECK_MINUTES,
  });
}

// `steps`: kept from a skill's demonstration when the recording redoes it
// from one of its steps on.
export async function startRecording(
  start: TeachStart,
  steps: TeachStep[] = [],
) {
  const api = getBrowserApi();
  const tab = await api.tabs.get(start.tabId);
  if (!isScriptableUrl(tab.url))
    throw new UserError("teachUnscriptable", "This page can't be recorded.");
  const sessions = await teachSessions.get();
  const existing = sessionOfTab(sessions, start.tabId);
  if (existing?.state === TEACH_STATE.recording) return existing;
  // One recording at a time, until it is saved or discarded: the side
  // panel shows one, and a second would record the first one's tab as a
  // tab switch.
  if (Object.keys(sessions).length)
    throw new UserError(
      USER_ERROR_CODE.teachBusy,
      "Another recording is open. Save or discard it first.",
    );
  // Input the agent sends to the page is trusted: it would pass for the
  // user's steps.
  if (tabsInUse().includes(start.tabId))
    throw new UserError(
      USER_ERROR_CODE.teachTabBusy,
      "The agent is working in this tab.",
    );
  const now = Date.now();
  const session: TeachSession = {
    id: crypto.randomUUID(),
    tabId: start.tabId,
    tabIds: [start.tabId],
    startedAt: now,
    lastEventAt: now,
    startUrl: urlPattern(tab.url),
    purpose: (start.purpose || "").trim().slice(0, TEACH_LIMITS.noteChars),
    varies: (start.varies || "").trim().slice(0, TEACH_LIMITS.noteChars),
    steps,
    state: TEACH_STATE.recording,
    dropped: 0,
    ...(start.redo ? { redo: start.redo } : {}),
    typedKey: newFingerprintKey(),
    typed: [],
  };
  await teachSessions.update((current) => ({
    ...current,
    [String(start.tabId)]: session,
  }));
  if (!(await injectRecorder(start.tabId))) {
    await discardRecording(start.tabId);
    throw new UserError("teachUnscriptable", "This page can't be recorded.");
  }
  await armIdleCheck();
  return session;
}

// Ends recording in the page. The session is written next when the user
// stopped it; when its tab closed or it went idle it waits, ended, for the
// user to write it from the side panel: nothing goes to the model without
// them.
export async function endRecording(tabId: number, endedBy?: TeachEndedBy) {
  const session = await updateSession(tabId, (current) =>
    current.state !== TEACH_STATE.recording
      ? current
      : endedBy
        ? { ...current, state: TEACH_STATE.ended, endedBy }
        : {
            ...current,
            state: TEACH_STATE.writing,
            failure: undefined,
            endedBy: undefined,
          },
  );
  if (session) await Promise.all(session.tabIds.map(endRecorder));
  return session;
}

export async function discardRecording(tabId: number) {
  const session = sessionOfTab(await teachSessions.get(), tabId);
  if (!session) return;
  await updateSession(tabId, () => undefined);
  await Promise.all(session.tabIds.map(endRecorder));
}

// A step into the recording: its fingerprints of typed values join the
// recording's, and the step loses any echo of a value typed so far, on any
// of its pages (the page took out what it knew already; navigations and
// tabs the background sees come only through here).
function withEvent(
  session: TeachSession,
  event: TeachEvent,
  add: typeof addTeachStep = addTeachStep,
): TeachSession {
  if (session.state !== TEACH_STATE.recording) return session;
  const { typed: added, ...rest } = event;
  const typed = mergeFingerprints(session.typed, added);
  const step = pageTextOf(
    redactStrings(rest, { key: session.typedKey, fingerprints: typed }),
  );
  const change = add(session.steps, step);
  return {
    ...session,
    typed,
    steps: change.steps,
    dropped: session.dropped + (change.dropped ? 1 : 0),
    lastEventAt: Date.now(),
  };
}

export async function recordEvent(tabId: number, event: TeachEvent) {
  await updateSession(tabId, (session) => withEvent(session, event));
}

// The page saw input it could not record, or focus went into a frame.
export async function recordUnrecorded(
  tabId: number,
  kind: keyof TeachUnrecorded,
) {
  if (kind !== "input" && kind !== "frames") return;
  await updateSession(tabId, (session) => {
    if (session.state !== TEACH_STATE.recording) return session;
    const unrecorded = session.unrecorded || { input: 0, frames: 0 };
    return {
      ...session,
      unrecorded: { ...unrecorded, [kind]: unrecorded[kind] + 1 },
    };
  });
}

// The URL as the page redacts it: a page that moved within its document
// still knows what was typed in it, including a field not committed yet.
async function redactedInPage(tabId: number, pattern: string) {
  const reply = await getBrowserApi()
    .tabs.sendMessage(
      tabId,
      { type: TEACH_PAGE_MESSAGE.redact, url: pattern },
      { frameId: 0 },
    )
    .catch(() => undefined);
  return typeof reply === "string" && reply ? reply : pattern;
}

async function recordNavigation(tabId: number, url: string) {
  const pattern = urlPattern(url);
  if (!pattern) return;
  const page = { title: "", url: await redactedInPage(tabId, pattern) };
  return updateSession(tabId, (session) =>
    withEvent(
      session,
      {
        id: crypto.randomUUID(),
        kind: TEACH_STEP_KIND.navigate,
        at: Date.now(),
        page,
      },
      addNavigation,
    ),
  );
}

// What a recording's own steps are made of besides the page's: where its
// tabs go, the tabs they open, other tabs the user turns to, and the end
// when its tab closes or nothing happened for a while.
export function setupTeachRecorder() {
  const api = getBrowserApi();
  const warn = (error: unknown) => console.warn("Teach mode", error);

  api.webNavigation?.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    void recordingOfTab(details.tabId)
      .then(
        (session) => session && recordNavigation(details.tabId, details.url),
      )
      .catch(warn);
  });
  api.webNavigation?.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    void recordingOfTab(details.tabId)
      .then(
        (session) => session && recordNavigation(details.tabId, details.url),
      )
      .catch(warn);
  });
  // Each new document of a recorded tab gets the recorder again.
  api.webNavigation?.onDOMContentLoaded.addListener((details) => {
    if (details.frameId !== 0) return;
    void recordingOfTab(details.tabId)
      .then((session) => session && injectRecorder(details.tabId))
      .catch(warn);
  });

  api.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined || tab.openerTabId === undefined) return;
    const tabId = tab.id;
    void recordingOfTab(tab.openerTabId)
      .then(
        (session) =>
          session &&
          updateSession(session.tabId, (current) =>
            withEvent(
              { ...current, tabIds: [...current.tabIds, tabId] },
              {
                id: crypto.randomUUID(),
                kind: TEACH_STEP_KIND.openTab,
                at: Date.now(),
                page: {
                  title: "",
                  url: urlPattern(tab.pendingUrl || tab.url) || "",
                },
              },
            ),
          ),
      )
      .catch(warn);
  });

  api.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void (async () => {
      const sessions = Object.values(await teachSessions.get()).filter(
        (session) =>
          session.state === TEACH_STATE.recording &&
          !session.tabIds.includes(tabId),
      );
      if (!sessions.length) return;
      const tab = await api.tabs.get(tabId);
      const site = hostOf(tab.url);
      for (const session of sessions) {
        const home = await api.tabs.get(session.tabId).catch(() => undefined);
        if (!site || home?.windowId !== windowId) continue;
        await recordEvent(session.tabId, {
          id: crypto.randomUUID(),
          kind: TEACH_STEP_KIND.switchTab,
          at: Date.now(),
          page: { title: "", url: cleanUrl(tab.url) && urlPattern(tab.url) },
          site,
        });
      }
    })().catch(warn);
  });

  api.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const session = sessionOfTab(await teachSessions.get(), tabId);
      if (!session) return;
      if (session.tabId !== tabId) {
        await updateSession(tabId, (current) => ({
          ...current,
          tabIds: current.tabIds.filter((id) => id !== tabId),
        }));
        return;
      }
      if (session.state === TEACH_STATE.recording)
        await endRecording(tabId, TEACH_ENDED_BY.tabClosed);
    })().catch(warn);
  });

  api.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name !== IDLE_ALARM) return;
    void stopIdleRecordings().catch(warn);
  });
}

async function stopIdleRecordings() {
  const sessions = Object.values(await teachSessions.get());
  const recording = sessions.filter(
    (session) => session.state === TEACH_STATE.recording,
  );
  if (!recording.length) {
    await getBrowserApi().alarms?.clear(IDLE_ALARM);
    return;
  }
  const idleBefore = Date.now() - TEACH_LIMITS.idleMinutes * 60_000;
  for (const session of recording)
    if (session.lastEventAt < idleBefore)
      await endRecording(session.tabId, TEACH_ENDED_BY.idle);
}

// Set by the writer (writer.ts), which turns a stopped recording into a
// draft skill; kept apart so the recorder does not depend on the model.
let onStopped: (tabId: number) => Promise<void> = async () => undefined;

export function whenRecordingStops(callback: (tabId: number) => Promise<void>) {
  onStopped = callback;
}

export async function finishRecording(tabId: number) {
  const session = await endRecording(tabId);
  if (session?.state === TEACH_STATE.writing) await onStopped(session.tabId);
  return session;
}
