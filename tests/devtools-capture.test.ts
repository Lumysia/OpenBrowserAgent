import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createRunTab } from "../src/background/run-tab";
import { CAPTURE_LIMITS } from "../src/background/devtools/capture-store";
import { devtoolsTool } from "../src/background/tools/devtools";
import type { ToolContext } from "../src/background/tools/types";
import { cdpFixture } from "./cdp-fixture";

afterEach(() => mock.restoreAll());

// A run whose end can be played: `end()` runs what tools left for it.
function runContext() {
  const endings: Array<() => unknown> = [];
  const context = {
    run: {
      tab: createRunTab("chat"),
      onEnd: (cleanup: () => unknown) => endings.push(cleanup),
    },
    toolCallId: "call",
    progress() {},
  } as unknown as ToolContext;
  const end = () => Promise.all(endings.splice(0).map((cleanup) => cleanup()));
  return { context, end };
}

const call = (context: ToolContext, input: Record<string, unknown>) =>
  devtoolsTool.execute({ tabId: 501, ...input }, context);

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

// The events Chrome sends for a login page whose API refuses the login.
function playLogin(f: ReturnType<typeof cdpFixture>) {
  const at = (line: number) => ({
    type: "script",
    stack: {
      callFrames: [{ url: "https://ha.test/app.js", lineNumber: line }],
    },
  });
  f.emit(501, "Page.frameNavigated", { frame: { url: "https://ha.test/" } });
  for (const id of ["1", "2"]) {
    f.emit(501, "Network.requestWillBeSent", {
      requestId: id,
      request: {
        method: "GET",
        url: `https://ha.test/static/${id}.js`,
        headers: {},
      },
      type: "Script",
      initiator: { type: "parser", url: "https://ha.test/", lineNumber: 3 },
      timestamp: 10,
    });
    f.emit(501, "Network.responseReceived", {
      requestId: id,
      type: "Script",
      response: { status: 200, statusText: "OK", headers: {} },
    });
    f.emit(501, "Network.loadingFinished", { requestId: id, timestamp: 10.01 });
  }
  f.emit(501, "Network.requestWillBeSent", {
    requestId: "3",
    request: {
      method: "POST",
      url: `https://ha.test/auth/login_flow/abc?state=x&access_token=${JWT}`,
      headers: { "Content-Type": "application/json" },
      postData: '{"username":"owner","password":"hunter2"}',
      hasPostData: true,
    },
    type: "Fetch",
    initiator: at(41),
    timestamp: 11,
  });
  f.emit(501, "Network.requestWillBeSentExtraInfo", {
    requestId: "3",
    headers: {
      "Content-Type": "application/json",
      Cookie: "session=s3cr3t",
      Authorization: `Bearer ${JWT}`,
    },
  });
  f.emit(501, "Network.responseReceived", {
    requestId: "3",
    type: "Fetch",
    response: {
      status: 401,
      statusText: "Unauthorized",
      mimeType: "application/json",
      headers: { "Set-Cookie": "session=new; HttpOnly", "X-Reason": "bad" },
    },
  });
  f.emit(501, "Network.loadingFinished", { requestId: "3", timestamp: 11.035 });
  f.emit(501, "Network.requestWillBeSent", {
    requestId: "4",
    request: { method: "GET", url: "http://127.0.0.1:9/down", headers: {} },
    type: "Fetch",
    initiator: at(50),
    timestamp: 12,
  });
  f.emit(501, "Network.loadingFailed", {
    requestId: "4",
    errorText: "net::ERR_CONNECTION_REFUSED",
    timestamp: 12.003,
  });
  f.emit(501, "Network.requestWillBeSent", {
    requestId: "5",
    request: { method: "GET", url: "https://other.test/api", headers: {} },
    type: "Fetch",
    initiator: at(60),
    timestamp: 13,
  });
  f.emit(501, "Network.loadingFailed", {
    requestId: "5",
    errorText: "net::ERR_FAILED",
    corsErrorStatus: { corsError: "MissingAllowOriginHeader" },
    timestamp: 13.002,
  });
  f.emit(501, "Network.loadingFailed", {
    requestId: "2",
    errorText: "net::ERR_ABORTED",
    canceled: true,
  });
  f.emit(501, "Runtime.consoleAPICalled", {
    type: "error",
    args: [
      { type: "string", value: "Login failed:" },
      {
        type: "object",
        className: "Object",
        preview: { properties: [{ name: "code", value: "invalid_auth" }] },
      },
    ],
    stackTrace: {
      callFrames: [{ url: "https://ha.test/app.js", lineNumber: 44 }],
    },
  });
  f.emit(501, "Runtime.consoleAPICalled", {
    type: "log",
    args: [{ type: "string", value: "debug noise" }],
  });
  f.emit(501, "Log.entryAdded", {
    entry: {
      level: "error",
      source: "network",
      networkRequestId: "3",
      text: "Failed to load resource: the server responded with a status of 401",
    },
  });
  f.emit(501, "Runtime.exceptionThrown", {
    exceptionDetails: {
      text: "Uncaught",
      exception: {
        description:
          "TypeError: user is undefined\n    at render (https://ha.test/app.js:70:3)\n    at a (x.js:1:1)\n    at b (x.js:2:1)\n    at c (x.js:3:1)",
      },
    },
  });
  f.emit(501, "Network.webSocketCreated", {
    requestId: "6",
    url: "wss://ha.test/api/websocket",
    initiator: at(80),
  });
  f.emit(501, "Network.webSocketWillSendHandshakeRequest", {
    requestId: "6",
    timestamp: 14,
    request: { headers: { Cookie: "session=s3cr3t" } },
  });
  f.emit(501, "Network.webSocketHandshakeResponseReceived", {
    requestId: "6",
    response: { status: 101, statusText: "Switching Protocols", headers: {} },
  });
  f.emit(501, "Network.webSocketFrameSent", {
    requestId: "6",
    response: {
      opcode: 1,
      payloadData: JSON.stringify({ type: "auth", access_token: "abc" }),
    },
  });
  f.emit(501, "Network.webSocketFrameReceived", {
    requestId: "6",
    response: { opcode: 1, payloadData: '{"type":"auth_invalid"}' },
  });
  f.emit(501, "Network.webSocketClosed", { requestId: "6", timestamp: 14.2 });
}

test("captured lists what went wrong, counts the rest, and redacts", async () => {
  const f = cdpFixture();
  const { context, end } = runContext();
  const started = await call(context, { action: "capture" });
  assert.match(
    started.text,
    /^Recording console, exceptions, http, websocket on tab 501/,
  );
  assert.match(started.text, /"being debugged" bar/);
  assert.deepEqual(
    f.calls.map((item) => item.method),
    ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"],
  );
  playLogin(f);
  const { text } = await call(context, { action: "captured" });
  const lines = text.split("\n");
  assert.equal(
    lines[0],
    "[Recording console, exceptions, http, websocket on tab 501; still recording.]",
  );
  assert.equal(
    lines[1],
    "Requests: 1 succeeded, 3 failed or 4xx/5xx, 1 canceled. Console: 1 error, 0 warnings, 1 other. 1 uncaught exception. 1 WebSocket.",
  );
  assert.deepEqual(lines.slice(2), [
    "n1 navigated to https://ha.test/",
    "r3 POST https://ha.test/auth/login_flow/abc?state=x&access_token=[redacted] → 401 Unauthorized, 35 ms, fetch, from script https://ha.test/app.js:42",
    "r4 GET http://127.0.0.1:9/down → failed: net::ERR_CONNECTION_REFUSED, 3 ms, fetch, from script https://ha.test/app.js:51",
    "r5 GET https://other.test/api → failed: net::ERR_FAILED (CORS MissingAllowOriginHeader), 2 ms, fetch, from script https://ha.test/app.js:61",
    "c1 console error: Login failed: {code: invalid_auth} at https://ha.test/app.js:45",
    "x1 Uncaught TypeError: user is undefined",
    "   at render (https://ha.test/app.js:70:3)",
    "   at a (x.js:1:1)",
    "   at b (x.js:2:1)",
    "w1 WebSocket wss://ha.test/api/websocket → 101 Switching Protocols, 1 sent, 1 received, closed after 200 ms (the debugger does not see close codes)",
    "[3 successful, canceled or low-level entries are not listed; all: true lists them.]",
    '[Headers and bodies: {"action":"request","id":"w1"}.]',
  ]);
  assert.doesNotMatch(text, /hunter2|s3cr3t|eyJ/);

  const all = await call(context, { action: "captured", all: true });
  assert.match(
    all.text,
    /r1 GET https:\/\/ha\.test\/static\/1\.js → 200 OK, 10 ms, script, from parser https:\/\/ha\.test\/:4/,
  );
  assert.match(all.text, /r2 GET .* → canceled: net::ERR_ABORTED/);
  assert.match(all.text, /c2 console log: debug noise/);
  await end();
});

test("request shows headers and bodies with credentials redacted", async () => {
  const f = cdpFixture();
  const send = f.api.sendCommand;
  mock.method(
    f.api,
    "sendCommand",
    async (target: any, method: string, params: any) =>
      method === "Network.getResponseBody"
        ? {
            body: Buffer.from(
              JSON.stringify({
                message: "Invalid password",
                refresh_token: "r",
              }),
            ).toString("base64"),
            base64Encoded: true,
          }
        : send(target, method, params),
  );
  const { context, end } = runContext();
  await call(context, { action: "capture" });
  playLogin(f);
  const { text } = await call(context, { action: "request", id: "r3" });
  assert.match(
    text,
    /^\[request r3 on tab 501 \| characters 0-\d+ of \d+; end\]/,
  );
  assert.match(
    text,
    /Request headers:\n  Content-Type: application\/json\n  Cookie: \[redacted\]\n  Authorization: \[redacted\]/,
  );
  assert.match(
    text,
    /Request body \(\d+ chars\):\n\{"username":"owner","password":"\[redacted\]"\}/,
  );
  assert.match(
    text,
    /Response headers:\n  Set-Cookie: \[redacted\]\n  X-Reason: bad/,
  );
  assert.match(
    text,
    /Response body \(application\/json\) \(\d+ chars\):\n\{"message":"Invalid password","refresh_token":"\[redacted\]"\}/,
  );
  assert.doesNotMatch(text, /hunter2|s3cr3t|eyJ/);

  const socket = await call(context, { action: "request", id: "w1" });
  assert.match(
    socket.text,
    /Handshake request headers:\n  Cookie: \[redacted\]/,
  );
  assert.match(
    socket.text,
    /→ \{"type":"auth","access_token":"\[redacted\]"\}\n← \{"type":"auth_invalid"\}/,
  );

  const wrong = await call(context, { action: "request", id: "c1" });
  assert.equal(wrong.isError, true);
  await end();
});

test("capture and emulation share one session; each releases only its own hold", async () => {
  const f = cdpFixture();
  const { context, end } = runContext();
  await call(context, { action: "emulate", colorScheme: "dark" });
  await call(context, { action: "capture", include: ["http"] });
  assert.equal(f.attaches.length, 1);
  await call(context, { action: "reset" });
  assert.equal(f.attached.size, 1, "the capture keeps the session");
  const stopped = await call(context, { action: "captured", stop: true });
  assert.match(stopped.text, /stopped: stopped on request/);
  assert.equal(f.attached.size, 0);

  await call(context, { action: "capture" });
  await call(context, { action: "emulate", colorScheme: "dark" });
  await call(context, { action: "captured", stop: true });
  assert.equal(f.attached.size, 1, "emulation keeps the session");
  assert.ok(f.calls.some((item) => item.method === "Network.disable"));
  await call(context, { action: "reset" });
  assert.equal(f.attached.size, 0);
  await end();
});

test("the run's end stops recording; the entries stay readable", async () => {
  const f = cdpFixture();
  const { context, end } = runContext();
  await call(context, { action: "capture", include: ["console"] });
  await call(context, { action: "capture", include: ["console"] });
  playLogin(f);
  await end();
  assert.equal(f.attached.size, 0);
  // Events after the end are not recorded.
  playLogin(f);
  const { text } = await call(runContext().context, { action: "captured" });
  assert.match(
    text,
    /^\[Recorded console on tab 501; stopped: the reply that started it ended\.\]/,
  );
  assert.match(text, /Console: 1 error, 0 warnings, 1 other\./);
  assert.doesNotMatch(text, /Requests:/);
  const body = await call(context, { action: "request", id: "r3" });
  assert.equal(body.isError, true);
});

test("a canceled debugger bar or a closed tab ends the recording", async () => {
  const f = cdpFixture();
  const { context, end } = runContext();
  await call(context, { action: "capture" });
  f.drop({ tabId: 501 }, "canceled_by_user");
  const canceled = await call(context, { action: "captured" });
  assert.match(canceled.text, /stopped: the user canceled debugging/);
  await call(context, { action: "capture" });
  f.drop({ tabId: 501 });
  const closed = await call(context, { action: "captured" });
  assert.equal(closed.isError, true);
  assert.match(closed.text, /Nothing was recorded on tab 501/);
  await end();
});

test("a recording keeps the newest entries and says how many it dropped", async () => {
  const f = cdpFixture();
  const { context, end } = runContext();
  await call(context, { action: "capture", include: ["console"] });
  for (let index = 0; index < CAPTURE_LIMITS.entries + 20; index++)
    f.emit(501, "Runtime.consoleAPICalled", {
      type: "warning",
      args: [{ type: "string", value: `warning ${index}` }],
    });
  const { text } = await call(context, { action: "captured", clear: true });
  assert.match(text, /\[20 older entries were dropped/);
  assert.match(text, /\[450 earlier entries are not shown\.\]/);
  assert.match(text, /c520 console warning: warning 519\n/);
  assert.match(text, /\[Cleared; still recording\.\]$/);
  const after = await call(context, { action: "captured" });
  assert.match(after.text, /Nothing recorded yet/);
  const bad = await call(context, { action: "capture", include: ["dom"] });
  assert.equal(bad.isError, true);
  await end();
});
