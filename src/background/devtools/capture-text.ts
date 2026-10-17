import { countOf } from "../tools/page";
import type {
  CaptureEntry,
  HttpEntry,
  Recording,
  SocketEntry,
} from "./capture-store";
import { redactBody, redactHeaders, redactText, redactUrl } from "./redact";

// What the model reads from a recording: everything passes through the
// redactor here, and stays short.

export const CAPTURE_TEXT_LIMITS = {
  // Entries in one summary, newest last.
  summaryEntries: 50,
  url: 160,
  message: 300,
  stackLines: 4,
  frame: 300,
  frames: 50,
} as const;

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const url = (value: string) => clip(redactUrl(value), CAPTURE_TEXT_LIMITS.url);
const message = (value: string) =>
  clip(
    redactText(value).replace(/\s+/g, " ").trim(),
    CAPTURE_TEXT_LIMITS.message,
  );

const ms = (from?: number, to?: number) =>
  from && to ? `${Math.round((to - from) * 1000)} ms` : undefined;

type HttpState = "ok" | "failed" | "canceled" | "pending";

function httpState(entry: HttpEntry): HttpState {
  if (entry.failure) return entry.failure.canceled ? "canceled" : "failed";
  if ((entry.status ?? 0) >= 400) return "failed";
  return entry.finished ? "ok" : "pending";
}

const isXhr = (entry: HttpEntry) =>
  entry.type === "XHR" || entry.type === "Fetch";

// Whether a summary lists the entry without `all`: everything but
// successful and canceled requests, pending ones other than fetch/XHR, and
// console messages below warning.
function isNotable(entry: CaptureEntry) {
  if (entry.kind === "http") {
    const state = httpState(entry);
    return state === "failed" || (state === "pending" && isXhr(entry));
  }
  if (entry.kind === "console")
    return entry.level === "error" || entry.level === "warning";
  return true;
}

function httpOutcome(entry: HttpEntry) {
  const { failure } = entry;
  if (failure)
    return `${failure.canceled ? "canceled" : "failed"}: ${failure.errorText}${failure.reason ? ` (${failure.reason})` : ""}`;
  if (entry.status === undefined) return "no response yet";
  return [entry.status, entry.statusText].filter(Boolean).join(" ");
}

function httpLine(entry: HttpEntry) {
  const facts = [
    ms(entry.started, entry.ended),
    entry.type?.toLowerCase(),
    entry.initiator && `from ${message(entry.initiator)}`,
  ].filter(Boolean);
  return `${entry.id} ${entry.method} ${url(entry.url)} → ${httpOutcome(entry)}${facts.length ? `, ${facts.join(", ")}` : ""}`;
}

function socketOutcome(entry: SocketEntry) {
  const parts = [
    entry.status !== undefined
      ? [entry.status, entry.statusText].filter(Boolean).join(" ")
      : "no handshake response",
    `${entry.sent} sent, ${entry.received} received`,
  ];
  if (entry.error) parts.push(`error: ${message(entry.error) || "unknown"}`);
  parts.push(
    entry.closed
      ? `closed after ${ms(entry.started, entry.closed) || "?"} (the debugger does not see close codes)`
      : "open",
  );
  return parts.join(", ");
}

export function entryLine(entry: CaptureEntry) {
  switch (entry.kind) {
    case "http":
      return httpLine(entry);
    case "websocket":
      return `${entry.id} WebSocket ${url(entry.url)} → ${socketOutcome(entry)}`;
    case "console":
      return `${entry.id} console ${entry.level}: ${message(entry.text)}${entry.location ? ` at ${url(entry.location)}` : ""}`;
    case "exception": {
      const [first, ...stack] = redactText(entry.text).split("\n");
      const lines = [
        `${entry.id} ${clip(first, CAPTURE_TEXT_LIMITS.message)}${!stack.length && entry.location ? ` at ${url(entry.location)}` : ""}`,
        ...stack
          .slice(0, CAPTURE_TEXT_LIMITS.stackLines - 1)
          .map((line) => `   ${clip(line.trim(), CAPTURE_TEXT_LIMITS.url)}`),
      ];
      return lines.join("\n");
    }
    case "navigation":
      return `${entry.id} navigated to ${url(entry.url)}`;
  }
}

function counts(recording: Recording) {
  const http: Record<HttpState, number> = {
    ok: 0,
    failed: 0,
    canceled: 0,
    pending: 0,
  };
  const levels: Record<string, number> = {};
  let exceptions = 0;
  let sockets = 0;
  for (const entry of recording.entries) {
    if (entry.kind === "http") http[httpState(entry)]++;
    else if (entry.kind === "console")
      levels[entry.level] = (levels[entry.level] || 0) + 1;
    else if (entry.kind === "exception") exceptions++;
    else if (entry.kind === "websocket") sockets++;
  }
  const facts = [];
  const requests = Object.values(http).reduce((sum, count) => sum + count, 0);
  if (recording.include.has("http"))
    facts.push(
      requests
        ? `Requests: ${http.ok} succeeded, ${http.failed} failed or 4xx/5xx${http.canceled ? `, ${http.canceled} canceled` : ""}${http.pending ? `, ${http.pending} pending` : ""}.`
        : "Requests: none.",
    );
  if (recording.include.has("console")) {
    const { error = 0, warning = 0 } = levels;
    const other =
      Object.values(levels).reduce((sum, count) => sum + count, 0) -
      error -
      warning;
    facts.push(
      `Console: ${countOf(error, "error")}, ${countOf(warning, "warning")}${other ? `, ${other} other` : ""}.`,
    );
  }
  if (recording.include.has("exceptions"))
    facts.push(`${countOf(exceptions, "uncaught exception")}.`);
  if (recording.include.has("websocket"))
    facts.push(`${countOf(sockets, "WebSocket")}.`);
  return facts.join(" ");
}

// The summary `captured` returns: counts, then the notable entries (every
// entry with `all`), newest last.
export function summaryText(
  header: string,
  recording: Recording,
  all: boolean,
) {
  const listed = recording.entries.filter((entry) => all || isNotable(entry));
  const shown = listed.slice(-CAPTURE_TEXT_LIMITS.summaryEntries);
  const hidden = listed.length - shown.length;
  const unlisted = recording.entries.length - listed.length;
  const example = shown.findLast(
    (entry) => entry.kind === "http" || entry.kind === "websocket",
  );
  const notes = [
    recording.dropped
      ? `${recording.dropped} older entries were dropped; a recording keeps the last ${recording.entries.length}.`
      : "",
    hidden ? `${hidden} earlier entries are not shown.` : "",
    unlisted
      ? `${unlisted} successful, canceled or low-level entries are not listed; all: true lists them.`
      : "",
    example
      ? `Headers and bodies: {"action":"request","id":"${example.id}"}.`
      : "",
  ].filter(Boolean);
  return [
    header,
    counts(recording),
    ...shown.map(entryLine),
    ...notes.map((note) => `[${note}]`),
  ].join("\n");
}

function headerLines(title: string, headers?: Record<string, unknown>) {
  const entries = Object.entries(redactHeaders(headers));
  if (!entries.length) return [`${title}: none recorded`];
  return [
    `${title}:`,
    ...entries.map(([name, value]) => `  ${name}: ${clip(value, 500)}`),
  ];
}

// A body, or why there is none.
export type BodyText = { text: string } | { note: string };

function bodyLines(title: string, body?: BodyText) {
  if (!body) return [];
  if ("note" in body) return [`${title}: ${body.note}`];
  return [`${title} (${body.text.length} chars):`, redactBody(body.text)];
}

export function httpDetail(
  entry: HttpEntry,
  bodies: { request?: BodyText; response?: BodyText },
) {
  return [
    httpLine(entry),
    ...entry.redirects.map(
      (hop) => `Redirected from ${url(hop.url)} (${hop.status})`,
    ),
    ...headerLines("Request headers", entry.requestHeaders),
    ...bodyLines("Request body", bodies.request),
    ...(entry.status === undefined
      ? []
      : headerLines("Response headers", entry.responseHeaders)),
    ...bodyLines(
      `Response body${entry.mimeType ? ` (${entry.mimeType})` : ""}`,
      bodies.response,
    ),
  ].join("\n");
}

export function socketDetail(entry: SocketEntry) {
  const frames = entry.frames.slice(-CAPTURE_TEXT_LIMITS.frames);
  const skipped = entry.sent + entry.received - frames.length;
  return [
    entryLine(entry),
    ...headerLines("Handshake request headers", entry.requestHeaders),
    ...headerLines("Handshake response headers", entry.responseHeaders),
    `Frames (${frames.length}${skipped ? ` newest; ${skipped} earlier not shown` : ""}):`,
    ...frames.map(
      (frame) =>
        `${frame.sent ? "→" : "←"} ${
          frame.opcode === 1
            ? clip(redactBody(frame.data), CAPTURE_TEXT_LIMITS.frame)
            : `[binary frame, opcode ${frame.opcode}]`
        }`,
    ),
  ].join("\n");
}
