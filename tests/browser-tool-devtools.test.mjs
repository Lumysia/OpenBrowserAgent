import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { browserToolFixture } from "./browser-tool-fixture.mjs";

// devtools capture against a page whose requests fail in each way the
// summary tells apart: an HTTP 500, a CORS block, a refused connection,
// plus a console error, an uncaught error and a WebSocket the server
// closes.

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SECRET = {
  password: "hunter2",
  cookie: "s3cr3tcookie",
  bearer: "tok-9f8e7d6c5b",
};

// Another origin: answers without CORS headers and serves a WebSocket
// that closes with 4001 after the first message.
async function otherOrigin() {
  const server = createServer((_request, response) =>
    response.writeHead(200, { "Content-Type": "text/plain" }).end("no cors"),
  );
  server.on("upgrade", (request, socket) => {
    const accept = createHash("sha1")
      .update(request.headers["sec-websocket-key"] + WS_GUID)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.once("data", () => {
      socket.write(Buffer.from([0x81, 5, ...Buffer.from("hello")]));
      const reason = Buffer.from("auth invalid");
      socket.write(
        Buffer.from([0x88, reason.length + 2, 0x0f, 0xa1, ...reason]),
      );
      setTimeout(() => socket.destroy(), 100);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

// A port nothing listens on.
async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const page = (other, refused) => `<title>Login</title><p id="state">Loading</p>
<script>
document.cookie = "session=${SECRET.cookie}";
const login = fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer ${SECRET.bearer}" },
  body: JSON.stringify({ username: "owner", password: "${SECRET.password}" }),
});
const cors = fetch("http://127.0.0.1:${other}/data");
const refused = fetch("http://127.0.0.1:${refused}/down");
console.error("Login failed", { code: "invalid_auth" });
setTimeout(() => { throw new Error("render failed"); });
const closed = new Promise((resolve) => {
  const socket = new WebSocket("ws://127.0.0.1:${other}/ws");
  socket.onopen = () => socket.send(JSON.stringify({ type: "auth", access_token: "${SECRET.bearer}" }));
  socket.onclose = resolve;
});
Promise.allSettled([login, cors, refused, closed]).then(() =>
  setTimeout(() => { document.getElementById("state").textContent = "All done"; }, 50));
</script>`;

const toolTexts = (body) =>
  body.messages
    .filter((message) => message.role === "tool")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text || "").join(""),
    );

test(
  "devtools capture records failures across reloads, redacted",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const other = await otherOrigin();
    const html = page(other.address().port, await closedPort());
    const fixture = await browserToolFixture((request, response) => {
      const path = new URL(request.url, "http://host").pathname;
      if (path === "/login") {
        response.writeHead(200, { "Content-Type": "text/html" }).end(html);
        return true;
      }
      if (path === "/api/login") {
        response
          .writeHead(500, {
            "Content-Type": "application/json",
            "Set-Cookie": `session=${SECRET.cookie}; Path=/`,
          })
          .end('{"error":"database is locked"}');
        return true;
      }
      return false;
    });
    try {
      const tabId = await fixture.open("/login");
      const attached = () =>
        fixture.page.call(
          async (id) =>
            (await chrome.debugger.getTargets()).find(
              (target) => target.tabId === id,
            )?.attached,
          tabId,
        );

      await t.test("captured shows each failure; request redacts", async () => {
        const wait = {
          name: "act",
          args: { tabId, steps: [{ action: "wait", text: "All done" }] },
        };
        const steps = [
          { name: "toolSearch", args: { names: ["devtools"] } },
          { name: "devtools", args: { action: "capture", tabId } },
          { name: "tabs", args: { action: "reload", tabId } },
          wait,
          { name: "tabs", args: { action: "reload", tabId } },
          wait,
          { name: "devtools", args: { action: "captured", tabId } },
        ];
        let captured;
        const texts = await fixture.run((body, index) => {
          if (index < steps.length)
            return { calls: [{ id: `s${index}`, ...steps[index] }] };
          if (index === steps.length) {
            captured = toolTexts(body).at(-1);
            // The first page's login: its body was kept before the reload.
            const id = captured.match(/(r\d+) POST \S+\/api\/login/)?.[1];
            return {
              calls: [
                {
                  id: "detail",
                  name: "devtools",
                  args: { action: "request", tabId, id },
                },
              ],
            };
          }
          return { text: "Fixture complete." };
        });
        const detail = texts.at(-1);
        assert.match(texts[1], /"being debugged" bar/);
        // Both page loads after capture started are in the recording.
        assert.equal(
          captured.match(/POST \S+\/api\/login → 500 Internal Server Error/g)
            ?.length,
          2,
        );
        assert.match(
          captured,
          /\/data → failed: net::ERR_FAILED \(CORS MissingAllowOriginHeader\)/,
        );
        assert.match(captured, /\/down → failed: net::ERR_CONNECTION_REFUSED/);
        assert.match(
          captured,
          /console error: Login failed \{code: invalid_auth\}/,
        );
        assert.match(captured, /Uncaught Error: render failed/);
        assert.match(
          captured,
          /WebSocket ws:\/\/127\.0\.0\.1:\d+\/ws → 101 Switching Protocols, 1 sent, 1 received, closed after \d+ ms/,
        );
        assert.match(
          captured,
          /n\d+ navigated to http:\/\/127\.0\.0\.1:\d+\/login/,
        );
        assert.match(detail, /Cookie: \[redacted\]/);
        assert.match(detail, /Authorization: \[redacted\]/);
        assert.match(detail, /Set-Cookie: \[redacted\]/);
        assert.match(detail, /"password":"\[redacted\]"/);
        assert.match(
          detail,
          /Response body \(application\/json\) \(\d+ chars\):\n\{"error":"database is locked"\}/,
        );
        for (const secret of Object.values(SECRET))
          assert.ok(!texts.join("\n").includes(secret), secret);
        // The run's end stopped recording and detached the debugger.
        assert.equal(await attached(), false);
      });

      await t.test("stopping a capture leaves emulation in place", async () => {
        const userAgent = () => fixture.evaluate(tabId, "navigator.userAgent");
        const original = await userAgent();
        await fixture.run([
          { name: "toolSearch", args: { names: ["devtools"] } },
          {
            name: "devtools",
            args: { action: "emulate", tabId, userAgent: "Fixture/1.0" },
          },
          {
            name: "devtools",
            args: { action: "capture", tabId, include: ["http"] },
          },
          { name: "devtools", args: { action: "captured", tabId, stop: true } },
        ]);
        assert.equal(await userAgent(), "Fixture/1.0");
        assert.equal(await attached(), true);
        await fixture.run([
          { name: "toolSearch", args: { names: ["devtools"] } },
          { name: "devtools", args: { action: "capture", tabId } },
          { name: "devtools", args: { action: "reset", tabId } },
        ]);
        assert.equal(await userAgent(), original);
        assert.equal(await attached(), false);
      });
    } finally {
      await fixture.close();
      other.close();
    }
  },
);
