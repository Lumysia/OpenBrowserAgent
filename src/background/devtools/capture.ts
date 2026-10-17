import { base64ToBytes } from "../../shared/binary";
import { errorMessage } from "../../shared/error-message";
import { isTextType } from "../../shared/mime";
import { isCdpHeld, releaseCdp, withCdp, type CdpSend } from "../cdp";
import type { RunContext } from "../tools/types";
import {
  CAPTURE_LIMITS,
  clearRecording,
  newRecording,
  recordEvent,
  type CaptureKind,
  type HttpEntry,
  type Recording,
} from "./capture-store";
import {
  httpDetail,
  socketDetail,
  summaryText,
  type BodyText,
} from "./capture-text";

// Recording a tab's network and console through the debugger. The session
// is held (see cdp.ts) so recording goes on across reloads and
// navigations, until stopped, the run that started it ends, the user
// cancels the debugger bar, or the tab closes.

type TabRecording = Recording & {
  active: boolean;
  stopReason?: string;
  // Runs that stop the recording when they end.
  runs: WeakSet<RunContext>;
};

const recordings = new Map<number, TabRecording>();

const DOMAINS: Record<CaptureKind, string[]> = {
  console: ["Runtime", "Log"],
  exceptions: ["Runtime"],
  http: ["Network"],
  websocket: ["Network"],
};
// Page events mark navigations between the entries.
const ALWAYS_ENABLED = ["Page"];

const STOP_REASON = {
  stopped: "stopped on request",
  runEnded: "the reply that started it ended",
  canceled: "the user canceled debugging from the browser's bar",
  detached: "the debugger detached",
} as const;

function onEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
) {
  const recording =
    source.tabId === undefined ? undefined : recordings.get(source.tabId);
  if (!recording?.active) return;
  const values = (params || {}) as Record<string, any>;
  recordEvent(recording, method, values);
  if (method !== "Network.loadingFinished") return;
  const entry = recording.byRequest.get(values.requestId);
  if (entry?.kind === "http" && (entry.status ?? 0) >= 400)
    void keepErrorBody(source, entry);
}

async function keepErrorBody(
  source: chrome.debugger.Debuggee,
  entry: HttpEntry,
) {
  try {
    const result = (await chrome.debugger.sendCommand(
      source,
      "Network.getResponseBody",
      { requestId: entry.requestId },
    )) as Record<string, any>;
    const body = responseBody(entry, result);
    entry.errorBody =
      "text" in body
        ? { text: body.text.slice(0, CAPTURE_LIMITS.errorBodyChars) }
        : body;
  } catch {
    // Read again on request, or reported as not available then.
  }
}

function onDetach(source: chrome.debugger.Debuggee, reason: string) {
  if (source.tabId === undefined) return;
  const recording = recordings.get(source.tabId);
  if (!recording?.active) return;
  // A closed tab's recording goes with it.
  if (reason === "target_closed") recordings.delete(source.tabId);
  else
    markStopped(
      recording,
      reason === "canceled_by_user"
        ? STOP_REASON.canceled
        : STOP_REASON.detached,
    );
  updateListeners();
}

function markStopped(recording: TabRecording, reason: string) {
  recording.active = false;
  recording.stopReason = reason;
}

// Listens to the debugger only while something records.
function updateListeners() {
  const recording = [...recordings.values()].some((item) => item.active);
  for (const [event, listener] of [
    [chrome.debugger.onEvent, onEvent],
    [chrome.debugger.onDetach, onDetach],
  ] as const) {
    const has = event.hasListener(listener as never);
    if (recording && !has) event.addListener(listener as never);
    if (!recording && has) event.removeListener(listener as never);
  }
}

// The tab's recording, current: a session that was let go of (a stopped
// call) has stopped recording.
function current(tabId: number) {
  const recording = recordings.get(tabId);
  if (recording?.active && !isCdpHeld(tabId, "capture")) {
    markStopped(recording, STOP_REASON.detached);
    updateListeners();
  }
  return recording;
}

export async function startCapture(
  tabId: number,
  include: CaptureKind[],
  run: RunContext,
  signal?: AbortSignal,
) {
  const existing = current(tabId);
  const recording: TabRecording = existing?.active
    ? Object.assign(existing, { include: new Set(include) })
    : { ...newRecording(include), active: true, runs: new WeakSet() };
  recordings.set(tabId, recording);
  // Listening first: events can come as soon as a domain is enabled.
  updateListeners();
  const domains = new Set([
    ...ALWAYS_ENABLED,
    ...include.flatMap((kind) => DOMAINS[kind]),
  ]);
  try {
    await withCdp(
      { tabId },
      async (send) => {
        for (const domain of domains) await send(`${domain}.enable`);
      },
      signal,
      "capture",
    );
  } catch (error) {
    if (!existing?.active) recordings.delete(tabId);
    updateListeners();
    throw error;
  }
  if (!recording.runs.has(run)) {
    recording.runs.add(run);
    run.onEnd(() => stopCapture(tabId, STOP_REASON.runEnded));
  }
  return { continued: !!existing?.active };
}

async function disableDomains(send: CdpSend) {
  for (const domain of ["Runtime", "Log", ...ALWAYS_ENABLED, "Network"])
    await send(`${domain}.disable`).catch(() => {});
}

// Stops recording on the tab; the recorded entries stay readable. Returns
// whether it was recording.
export async function stopCapture(
  tabId: number,
  reason: string = STOP_REASON.stopped,
) {
  const recording = current(tabId);
  if (!recording?.active) return false;
  markStopped(recording, reason);
  updateListeners();
  await releaseCdp({ tabId }, "capture", disableDomains);
  return true;
}

export function captureNotFound(tabId: number) {
  return `Nothing was recorded on tab ${tabId}. Start with {"action":"capture"}, then reproduce the problem.`;
}

export async function capturedSummary(
  tabId: number,
  options: { all: boolean; clear: boolean; stop: boolean },
) {
  const recording = current(tabId);
  if (!recording) return undefined;
  if (options.stop) await stopCapture(tabId);
  const kinds = [...recording.include].join(", ");
  const header = recording.active
    ? `[Recording ${kinds} on tab ${tabId}; still recording.]`
    : `[Recorded ${kinds} on tab ${tabId}; stopped: ${recording.stopReason}.]`;
  const text = recording.entries.length
    ? summaryText(header, recording, options.all)
    : `${header}\nNothing recorded yet. Reproduce the problem (reload the page, or ask the user to try again and wait for their answer), then read captured again.`;
  if (options.clear) clearRecording(recording);
  return {
    text: options.clear
      ? `${text}\n[Cleared${recording.active ? "; still recording" : ""}.]`
      : text,
    active: recording.active,
    entries: recording.entries.length,
  };
}

// One request's or WebSocket's details, with bodies read on demand.
export async function captureEntryDetail(
  tabId: number,
  id: string,
  signal?: AbortSignal,
): Promise<{ text: string } | { error: string }> {
  const recording = current(tabId);
  if (!recording) return { error: captureNotFound(tabId) };
  const entry = recording.entries.find((item) => item.id === id);
  if (!entry)
    return {
      error: `No entry "${id}" in the recording of tab ${tabId}; ids come from {"action":"captured"}.`,
    };
  if (entry.kind === "websocket") return { text: socketDetail(entry) };
  if (entry.kind !== "http")
    return {
      error: `${id} is not a request; request takes the id of a request (r…) or WebSocket (w…).`,
    };
  return {
    text: httpDetail(entry, await bodies(tabId, recording, entry, signal)),
  };
}

const NOT_RECORDING = "not available: recording has stopped";

// Chrome's protocol errors come as JSON text.
function unavailable(error: unknown) {
  const text = errorMessage(error);
  const message = /"message":"([^"]*)"/.exec(text)?.[1] || text;
  return `not available (${message}; Chrome drops bodies when the page navigates or reloads)`;
}

async function bodies(
  tabId: number,
  recording: TabRecording,
  entry: HttpEntry,
  signal?: AbortSignal,
): Promise<{ request?: BodyText; response?: BodyText }> {
  const sent = entry.postData ?? undefined;
  const needsRequest = sent === undefined && entry.hasPostData;
  const needsResponse =
    entry.status !== undefined && !entry.failure && !entry.errorBody;
  const request: BodyText | undefined =
    sent !== undefined ? { text: sent } : undefined;
  if (!recording.active)
    return {
      request: needsRequest ? { note: NOT_RECORDING } : request,
      response: needsResponse ? { note: NOT_RECORDING } : entry.errorBody,
    };
  return withCdp(
    { tabId },
    async (send) => ({
      request: needsRequest
        ? await send("Network.getRequestPostData", {
            requestId: entry.requestId,
          }).then(
            (result) => ({ text: String(result.postData ?? "") }),
            (error) => ({ note: unavailable(error) }),
          )
        : request,
      response: needsResponse
        ? await send("Network.getResponseBody", {
            requestId: entry.requestId,
          }).then(
            (result) => responseBody(entry, result),
            (error) => ({ note: unavailable(error) }),
          )
        : entry.errorBody,
    }),
    signal,
  );
}

function responseBody(entry: HttpEntry, result: Record<string, any>): BodyText {
  const body = String(result.body ?? "");
  if (!result.base64Encoded) return { text: body };
  const bytes = base64ToBytes(body);
  if (!isTextType(entry.mimeType || ""))
    return {
      note: `${bytes.length} bytes of ${entry.mimeType || "binary data"}, not shown`,
    };
  return { text: new TextDecoder().decode(bytes) };
}
