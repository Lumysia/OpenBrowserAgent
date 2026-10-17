import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REDACTED,
  redactBody,
  redactHeaders,
  redactText,
  redactUrl,
} from "../src/background/devtools/redact";

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

test("credential headers are always redacted, other headers kept", () => {
  assert.deepEqual(
    redactHeaders({
      Cookie: "sid=1; theme=dark",
      "Set-Cookie": "sid=2; HttpOnly",
      Authorization: "Bearer abc",
      "Proxy-Authorization": "Basic Zm9vOmJhcg==",
      "X-CSRF-Token": "t",
      "X-XSRF-TOKEN": "t",
      "X-Api-Key": "k",
      "X-Session-Id": "s",
      "Client-Secret": "s",
      "Content-Type": "application/json",
      Referer: `https://example.test/cb?access_token=${JWT}`,
    }),
    {
      Cookie: REDACTED,
      "Set-Cookie": REDACTED,
      Authorization: REDACTED,
      "Proxy-Authorization": REDACTED,
      "X-CSRF-Token": REDACTED,
      "X-XSRF-TOKEN": REDACTED,
      "X-Api-Key": REDACTED,
      "X-Session-Id": REDACTED,
      "Client-Secret": REDACTED,
      "Content-Type": "application/json",
      Referer: `https://example.test/cb?access_token=${REDACTED}`,
    },
  );
});

test("URLs lose secret query and fragment values, passwords and token paths", () => {
  assert.equal(
    redactUrl("https://host.test/api/states?entity=light.kitchen&page=2"),
    "https://host.test/api/states?entity=light.kitchen&page=2",
  );
  assert.equal(
    redactUrl(
      "https://host.test/auth/authorize?client_id=app&api_key=abc&code=1",
    ),
    `https://host.test/auth/authorize?client_id=app&api_key=${REDACTED}&code=1`,
  );
  assert.equal(
    redactUrl("https://host.test/cb#access_token=abc&state=x"),
    `https://host.test/cb#access_token=${REDACTED}&state=x`,
  );
  assert.equal(
    redactUrl("https://user:hunter2@host.test/"),
    `https://user:${REDACTED}@host.test/`,
  );
  assert.equal(
    redactUrl(`wss://host.test/reset/${JWT}/confirm`),
    `wss://host.test/reset/${REDACTED}/confirm`,
  );
  assert.equal(
    redactUrl(
      "https://host.test/static/app.3f9a8c0d1e2f3a4b5c6d7e8f9a0b1c2d.js",
    ),
    "https://host.test/static/app.3f9a8c0d1e2f3a4b5c6d7e8f9a0b1c2d.js",
  );
});

test("JSON and form bodies lose secret fields at any depth", () => {
  assert.equal(
    redactBody(
      JSON.stringify({
        username: "owner",
        password: "hunter2",
        client_id: "https://host.test/",
        nested: [{ refresh_token: "r", keep: 1 }],
        note: `Bearer ${"x".repeat(20)}`,
      }),
    ),
    JSON.stringify({
      username: "owner",
      password: REDACTED,
      client_id: "https://host.test/",
      nested: [{ refresh_token: REDACTED, keep: 1 }],
      note: `Bearer ${REDACTED}`,
    }),
  );
  assert.equal(
    redactBody("username=owner&password=hunter2&remember=1"),
    `username=owner&password=${REDACTED}&remember=1`,
  );
  // Bodies without secrets come back as they were sent.
  const plain = '{ "message": "Invalid username or password" }';
  assert.equal(redactBody(plain), plain);
  assert.equal(redactBody("a=1&b=2"), "a=1&b=2");
});

test("text loses credentials, JWTs, long tokens and secret pairs", () => {
  assert.equal(
    redactText(`Authorization failed for Bearer abcdefgh.ijk and ${JWT}`),
    `Authorization failed for Bearer ${REDACTED} and ${REDACTED}`,
  );
  assert.equal(
    redactText('{"type":"auth","access_token":"abc'),
    `{"type":"auth","access_token":"${REDACTED}"`,
  );
  assert.equal(
    redactText("session=abc; path=/"),
    `session=${REDACTED}; path=/`,
  );
  assert.equal(
    redactText("token aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gH2 issued"),
    `token ${REDACTED} issued`,
  );
  // Words, sentences and hex hashes stay.
  const message =
    "Login failed: invalid username or password (request 3f9a8c0d1e2f3a4b5c6d7e8f9a0b1c2d)";
  assert.equal(redactText(message), message);
});
