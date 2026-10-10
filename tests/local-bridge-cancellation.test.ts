import assert from "node:assert/strict";
import { test, mock, afterEach } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { storage } from "../src/shared/storage";
import {
  startLocalExecutionBridge,
  getLocalExecutionBridgeStatus,
  cancelLocalExecutionBridge,
} from "../src/background/local-execution-bridge-tools";
import { toolBrowser, eventListeners, deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

async function nativeFixture() {
  const directory = await mkdtemp(join(tmpdir(), "oba-followup2-bridge-"));
  const config = join(directory, "fixture.json");
  const marker = join(directory, "unexpected-effect");
  await writeFile(
    config,
    JSON.stringify({
      commands: [
        {
          id: "fixture",
          secret: "disposable-fixture",
          shell: "/bin/sh",
          cwd: directory,
        },
      ],
    }),
  );
  const child = spawn(
    process.execPath,
    [resolve("packages/local-execution-bridge/bin/bridge.mjs")],
    {
      env: {
        PATH: "/usr/bin:/bin",
        HOME: directory,
        OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG: config,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let pending = Buffer.alloc(0);
  const events: any[] = [];
  const received = eventListeners<(value: any) => void>();
  child.stdout.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (
      pending.length >= 4 &&
      pending.length >= 4 + pending.readUInt32LE(0)
    ) {
      const length = pending.readUInt32LE(0);
      const message = JSON.parse(pending.subarray(4, length + 4).toString());
      pending = pending.subarray(length + 4);
      events.push(message);
      received.emit(message);
    }
  });
  const send = (message: object) => {
    const payload = Buffer.from(JSON.stringify(message));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    child.stdin.write(Buffer.concat([header, payload]));
  };
  const wait = async (predicate: (event: any) => boolean) => {
    const existing = events.find(predicate);
    if (existing) return existing;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        received.removeListener(listener);
        reject(new Error("Native fixture event timed out"));
      }, 5000);
      const listener = (event: any) => {
        if (predicate(event)) {
          clearTimeout(timer);
          received.removeListener(listener);
          resolve(event);
        }
      };
      received.addListener(listener);
    });
  };
  const code = `process.on('SIGTERM',()=>{});console.log('ready');setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'effect'),1800);setInterval(()=>{},1000)`;
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const run = (timeoutMs = 10000, extra = {}) =>
    send({
      type: "command.run",
      taskId: "fixture",
      command: { key: "fixture", secret: "disposable-fixture" },
      commandLine: `${quote(process.execPath)} -e ${quote(code)} & wait`,
      timeoutMs,
      ...extra,
    });
  return {
    child,
    events,
    marker,
    send,
    wait,
    run,
    async close() {
      if (child.exitCode === null) {
        const exit = once(child, "exit");
        child.stdin.end();
        child.kill("SIGTERM");
        await exit;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}

for (const mode of ["cancel", "timeout", "eof"] as const)
  test(
    `native bridge ${mode} stops a TERM-resistant shell descendant before later effects`,
    { timeout: 10000 },
    async () => {
      const fixture = await nativeFixture();
      try {
        fixture.run(mode === "timeout" ? 700 : 10000);
        await fixture.wait(
          (event) => event.type === "stdout" && event.data.includes("ready"),
        );
        if (mode === "cancel")
          fixture.send({ type: "command.cancel", taskId: "fixture" });
        if (mode === "eof") fixture.child.stdin.end();
        const terminal = await fixture.wait((event) =>
          ["command.done", "command.error"].includes(event.type),
        );
        if (mode === "timeout") assert.match(terminal.error, /timed out/);
        else assert.equal(terminal.event, "canceled");
        await delay(1900);
        await assert.rejects(readFile(fixture.marker), { code: "ENOENT" });
        assert.equal(
          fixture.events.filter((event) =>
            ["command.done", "command.error"].includes(event.type),
          ).length,
          1,
        );
      } finally {
        await fixture.close();
      }
    },
  );

function extensionFixture(pong = true) {
  toolBrowser();
  const bridge = {
    id: "fixture",
    name: "Fixture",
    hostName: "openbrowseragent.local_execution_bridge",
    bridgeKey: "fixture",
    secret: "disposable-fixture",
    createdAt: 1,
    updatedAt: 1,
  };
  mock.method(storage.localExecutionBridges, "get", async () => [bridge]);
  mock.method(storage.localExecutionBridges, "set", async () => {});
  const sent: any[] = [];
  const ports: any[] = [];
  Object.assign(chrome, {
    runtime: {
      connectNative: () => {
        const onMessage = eventListeners();
        const onDisconnect = eventListeners();
        const port = {
          onMessage,
          onDisconnect,
          disconnected: false,
          disconnect() {
            port.disconnected = true;
          },
          postMessage(message: any) {
            sent.push(message);
            if (pong && message.type === "command.ping")
              queueMicrotask(() => onMessage.emit({ type: "command.pong" }));
          },
        };
        ports.push(port);
        return port;
      },
    },
  });
  return { sent, ports };
}

test(
  "native bridge reports a spawn failure once",
  { timeout: 10000 },
  async () => {
    const fixture = await nativeFixture();
    try {
      fixture.run(10000, { cwd: fixture.marker });
      await fixture.wait((event) => event.type === "command.error");
      await delay(100);
      assert.equal(
        fixture.events.filter((event) =>
          ["command.done", "command.error"].includes(event.type),
        ).length,
        1,
      );
    } finally {
      await fixture.close();
    }
  },
);

test("extension abort during native ping cannot dispatch a command", async () => {
  const fixture = extensionFixture(false);
  const controller = new AbortController();
  const running = startLocalExecutionBridge(
    { command: "fixture" },
    {},
    undefined,
    controller.signal,
  );
  while (!fixture.sent.length) await delay(0);
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(fixture.ports[0].disconnected, true);
  assert.equal(
    fixture.sent.some((message) => message.type === "command.run"),
    false,
  );
});

test("extension stream abort delivers cancel, waits for ack, and preserves terminal state and output whitespace", async () => {
  const fixture = extensionFixture();
  const controller = new AbortController();
  const output = await startLocalExecutionBridge(
    { command: "fixture" },
    {},
    undefined,
    controller.signal,
  );
  const taskId = output.taskId!;
  const port = fixture.ports[1];
  port.onMessage.emit({ type: "stdout", taskId, data: "line one\n" });
  controller.abort();
  assert.equal(fixture.sent.at(-1).type, "command.cancel");
  assert.equal(port.disconnected, false);
  const canceled = cancelLocalExecutionBridge({ taskId });
  port.onMessage.emit({ type: "command.done", event: "canceled", taskId });
  assert.equal((await canceled).state, "canceled");
  port.onMessage.emit({ type: "command.error", taskId, error: "late" });
  const status = await getLocalExecutionBridgeStatus({ taskId });
  assert.equal(status.state, "canceled");
  assert.equal(status.output, "line one\n");
  assert.equal(port.disconnected, true);
});
