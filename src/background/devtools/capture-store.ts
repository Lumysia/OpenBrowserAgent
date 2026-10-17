import { isRecord } from "../../shared/values";

// What a capture records on one tab, from the debugger's events. Entries
// stay as Chrome reported them; redaction happens when they are written
// for the model (capture-text.ts).

export const CAPTURE_KINDS = [
  "console",
  "exceptions",
  "http",
  "websocket",
] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

// The newest entries a recording keeps per tab, and frames per WebSocket.
export const CAPTURE_LIMITS = {
  entries: 500,
  frames: 100,
  earlyHeaders: 100,
  errorBodyChars: 32_000,
} as const;

type Headers = Record<string, unknown>;

export type HttpEntry = {
  kind: "http";
  id: string;
  requestId: string;
  method: string;
  url: string;
  type?: string;
  initiator: string;
  started: number;
  ended?: number;
  status?: number;
  statusText?: string;
  mimeType?: string;
  requestHeaders: Headers;
  responseHeaders?: Headers;
  postData?: string;
  hasPostData: boolean;
  redirects: Array<{ url: string; status: number }>;
  finished: boolean;
  failure?: { errorText: string; canceled: boolean; reason?: string };
  // An error response's body, kept when it arrived: Chrome drops bodies
  // when the page navigates, as pages often do after a failed request.
  errorBody?: { text: string } | { note: string };
};

export type Frame = { sent: boolean; opcode: number; data: string };

export type SocketEntry = {
  kind: "websocket";
  id: string;
  requestId: string;
  url: string;
  initiator: string;
  started: number;
  status?: number;
  statusText?: string;
  requestHeaders?: Headers;
  responseHeaders?: Headers;
  frames: Frame[];
  sent: number;
  received: number;
  closed?: number;
  error?: string;
};

export type ConsoleEntry = {
  kind: "console";
  id: string;
  level: string;
  text: string;
  location?: string;
};

export type ExceptionEntry = {
  kind: "exception";
  id: string;
  text: string;
  location?: string;
};

export type NavigationEntry = { kind: "navigation"; id: string; url: string };

export type CaptureEntry =
  HttpEntry | SocketEntry | ConsoleEntry | ExceptionEntry | NavigationEntry;

const ID_PREFIX: Record<CaptureEntry["kind"], string> = {
  http: "r",
  websocket: "w",
  console: "c",
  exception: "x",
  navigation: "n",
};

export type Recording = {
  include: Set<CaptureKind>;
  entries: CaptureEntry[];
  // Entries the ring dropped to stay within CAPTURE_LIMITS.entries.
  dropped: number;
  // Network entries by Chrome's requestId, while they are kept.
  byRequest: Map<string, HttpEntry | SocketEntry>;
  counters: Record<string, number>;
  // Sent headers that came before their request's requestWillBeSent.
  earlyHeaders: Map<string, Headers>;
};

export function newRecording(include: Iterable<CaptureKind>): Recording {
  return {
    include: new Set(include),
    entries: [],
    dropped: 0,
    byRequest: new Map(),
    counters: {},
    earlyHeaders: new Map(),
  };
}

export function clearRecording(recording: Recording) {
  recording.entries = [];
  recording.dropped = 0;
  recording.byRequest.clear();
  recording.earlyHeaders.clear();
}

function early(recording: Recording, requestId: string, headers: Headers) {
  const { earlyHeaders } = recording;
  earlyHeaders.set(requestId, headers);
  if (earlyHeaders.size > CAPTURE_LIMITS.earlyHeaders)
    earlyHeaders.delete(earlyHeaders.keys().next().value!);
}

function takeEarly(recording: Recording, requestId: string) {
  const headers = recording.earlyHeaders.get(requestId);
  recording.earlyHeaders.delete(requestId);
  return headers;
}

function add<T extends CaptureEntry>(
  recording: Recording,
  entry: Omit<T, "id">,
): T {
  const prefix = ID_PREFIX[entry.kind];
  const count = (recording.counters[prefix] || 0) + 1;
  recording.counters[prefix] = count;
  const added = { ...entry, id: `${prefix}${count}` } as T;
  recording.entries.push(added);
  if (recording.entries.length > CAPTURE_LIMITS.entries) {
    const [old] = recording.entries.splice(0, 1);
    recording.dropped++;
    if (old.kind === "http" || old.kind === "websocket")
      recording.byRequest.delete(old.requestId);
  }
  return added;
}

type CallFrame = { url?: string; lineNumber?: number; columnNumber?: number };

const frameLocation = (frame?: CallFrame) =>
  frame?.url ? `${frame.url}:${(frame.lineNumber ?? 0) + 1}` : undefined;

function stackTop(stack: unknown): CallFrame | undefined {
  // An async stack has its frames on a parent.
  for (let item = stack; isRecord(item); item = item.parent) {
    const frames = item.callFrames;
    if (Array.isArray(frames) && frames.length) return frames[0];
  }
}

function initiatorText(initiator: Record<string, any> = {}) {
  const at =
    frameLocation(stackTop(initiator.stack)) ||
    (initiator.url
      ? frameLocation({
          url: initiator.url,
          lineNumber: initiator.lineNumber,
        })
      : undefined);
  return [initiator.type || "other", at].filter(Boolean).join(" ");
}

// One console argument as DevTools would print it, briefly.
function remoteText(value: Record<string, any>): string {
  if (value.type === "string") return value.value;
  if ("value" in value) return String(value.value);
  if (value.unserializableValue) return value.unserializableValue;
  const preview = value.preview;
  if (preview?.properties?.length && value.subtype !== "error") {
    const fields = preview.properties
      .map((item: Record<string, any>) => `${item.name}: ${item.value}`)
      .join(", ");
    return preview.subtype === "array"
      ? `[${fields}]`
      : `${value.className === "Object" ? "" : `${value.className} `}{${fields}${preview.overflow ? ", …" : ""}}`;
  }
  return value.description ?? value.type;
}

const CONSOLE_LEVEL: Record<string, string> = {
  warning: "warning",
  warn: "warning",
  error: "error",
  assert: "error",
};

// Applies one debugger event to the recording. Returns whether it was one
// the recording keeps.
export function recordEvent(
  recording: Recording,
  method: string,
  params: Record<string, any>,
) {
  const { include, byRequest } = recording;
  const http = (id: string) => {
    const entry = byRequest.get(id);
    return entry?.kind === "http" ? entry : undefined;
  };
  const socket = (id: string) => {
    const entry = byRequest.get(id);
    return entry?.kind === "websocket" ? entry : undefined;
  };
  switch (method) {
    case "Page.frameNavigated":
      if (params.frame?.parentId) return false;
      add<NavigationEntry>(recording, {
        kind: "navigation",
        url: params.frame?.url || "",
      });
      return true;
    case "Network.requestWillBeSent": {
      if (!include.has("http")) return false;
      const existing = http(params.requestId);
      if (existing && params.redirectResponse) {
        existing.redirects.push({
          url: existing.url,
          status: params.redirectResponse.status,
        });
        existing.url = params.request.url;
        existing.method = params.request.method;
        return true;
      }
      const entry = add<HttpEntry>(recording, {
        kind: "http",
        requestId: params.requestId,
        method: params.request.method,
        url: params.request.url,
        type: params.type,
        initiator: initiatorText(params.initiator),
        started: params.timestamp,
        requestHeaders:
          takeEarly(recording, params.requestId) ||
          params.request.headers ||
          {},
        postData: params.request.postData,
        hasPostData: !!params.request.hasPostData,
        redirects: [],
        finished: false,
      });
      byRequest.set(entry.requestId, entry);
      return true;
    }
    case "Network.requestWillBeSentExtraInfo": {
      // The headers as sent, cookies included; they come before or after
      // requestWillBeSent.
      const entry = http(params.requestId);
      if (entry) entry.requestHeaders = params.headers || entry.requestHeaders;
      else early(recording, params.requestId, params.headers);
      return !!entry;
    }
    case "Network.responseReceived": {
      const entry = http(params.requestId);
      if (!entry) return false;
      entry.status = params.response.status;
      entry.statusText = params.response.statusText;
      entry.mimeType = params.response.mimeType;
      entry.type = params.type || entry.type;
      // Headers from responseReceivedExtraInfo are the raw ones.
      entry.responseHeaders ??= params.response.headers;
      return true;
    }
    case "Network.responseReceivedExtraInfo": {
      const entry = http(params.requestId);
      if (!entry) return false;
      entry.responseHeaders = params.headers;
      entry.status ??= params.statusCode;
      return true;
    }
    case "Network.loadingFinished": {
      const entry = http(params.requestId);
      if (!entry) return false;
      entry.finished = true;
      entry.ended = params.timestamp;
      return true;
    }
    case "Network.loadingFailed": {
      const entry = http(params.requestId);
      if (!entry) return false;
      entry.finished = true;
      entry.ended = params.timestamp;
      const cors = params.corsErrorStatus?.corsError;
      entry.failure = {
        errorText: params.errorText || "failed",
        canceled: !!params.canceled,
        reason: cors
          ? `CORS ${cors}`
          : params.blockedReason
            ? `blocked: ${params.blockedReason}`
            : undefined,
      };
      return true;
    }
    case "Network.webSocketCreated": {
      if (!include.has("websocket")) return false;
      const entry = add<SocketEntry>(recording, {
        kind: "websocket",
        requestId: params.requestId,
        url: params.url,
        initiator: initiatorText(params.initiator),
        started: params.timestamp ?? 0,
        frames: [],
        sent: 0,
        received: 0,
      });
      byRequest.set(entry.requestId, entry);
      return true;
    }
    case "Network.webSocketWillSendHandshakeRequest": {
      const entry = socket(params.requestId);
      if (!entry) return false;
      entry.requestHeaders = params.request?.headers;
      entry.started = params.timestamp;
      return true;
    }
    case "Network.webSocketHandshakeResponseReceived": {
      const entry = socket(params.requestId);
      if (!entry) return false;
      entry.status = params.response?.status;
      entry.statusText = params.response?.statusText;
      entry.responseHeaders = params.response?.headers;
      return true;
    }
    case "Network.webSocketFrameSent":
    case "Network.webSocketFrameReceived": {
      const entry = socket(params.requestId);
      if (!entry) return false;
      const sent = method === "Network.webSocketFrameSent";
      if (sent) entry.sent++;
      else entry.received++;
      entry.frames.push({
        sent,
        opcode: params.response?.opcode,
        data: params.response?.payloadData ?? "",
      });
      if (entry.frames.length > CAPTURE_LIMITS.frames) entry.frames.shift();
      return true;
    }
    case "Network.webSocketFrameError": {
      const entry = socket(params.requestId);
      if (!entry) return false;
      entry.error = params.errorMessage || "error";
      return true;
    }
    case "Network.webSocketClosed": {
      const entry = socket(params.requestId);
      if (!entry) return false;
      entry.closed = params.timestamp;
      return true;
    }
    case "Runtime.consoleAPICalled": {
      if (!include.has("console")) return false;
      add<ConsoleEntry>(recording, {
        kind: "console",
        level: CONSOLE_LEVEL[params.type] || params.type,
        text: (params.args || []).map(remoteText).join(" "),
        location: frameLocation(params.stackTrace?.callFrames?.[0]),
      });
      return true;
    }
    case "Log.entryAdded": {
      const entry = params.entry || {};
      // A failed request's message repeats its HTTP entry.
      if (!include.has("console") || entry.networkRequestId) return false;
      add<ConsoleEntry>(recording, {
        kind: "console",
        level: CONSOLE_LEVEL[entry.level] || entry.level,
        text: entry.text || "",
        location:
          frameLocation(entry.stackTrace?.callFrames?.[0]) ||
          frameLocation({ url: entry.url, lineNumber: entry.lineNumber }),
      });
      return true;
    }
    case "Runtime.exceptionThrown": {
      if (!include.has("exceptions")) return false;
      const details = params.exceptionDetails || {};
      add<ExceptionEntry>(recording, {
        kind: "exception",
        // "Uncaught" or "Uncaught (in promise)", then the error with its
        // stack.
        text: [
          details.text,
          details.exception?.description ?? details.exception?.value,
        ]
          .filter((part) => part !== undefined && part !== "")
          .join(" "),
        location:
          frameLocation(details.stackTrace?.callFrames?.[0]) ||
          frameLocation(details),
      });
      return true;
    }
  }
  return false;
}
