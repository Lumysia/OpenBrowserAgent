import assert from "node:assert/strict";
import { test, mock, afterEach } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { storage } from "../src/shared/storage";
import { runLocalCommand } from "../src/background/local-execution-bridge-tasks";
import { localCommandTool } from "../src/background/tools/local";
import { eventListeners } from "./fake-chrome";
import { LOCAL_EXECUTION_BRIDGE_LIMITS } from "../src/shared/config";
import {
  BRIDGE_ERROR,
  BRIDGE_MESSAGE,
} from "../src/shared/local-execution-bridge-protocol";
import { LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME } from "../src/shared/local-execution-bridges";
// @ts-expect-error The installer is plain JavaScript without types.
import { HOST_NAME } from "../packages/local-execution-bridge/bin/install-support.mjs";
import { toolBrowser } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

async function nativeFixture() {
  const directory = await mkdtemp(join(tmpdir(), "oba-native-bridge-"));
  const config = join(directory, "fixture.json");
  const marker = join(directory, "unexpected-effect");
  const ready = join(directory, "ready");
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
  const code = `process.on('SIGTERM',()=>{});require('fs').writeFileSync(${JSON.stringify(ready)},String(Date.now()));console.log('ready');setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'effect'),1800);setInterval(()=>{},1000)`;
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const run = (extra = {}) =>
    send({
      type: "command.run",
      taskId: "fixture",
      command: { key: "fixture", secret: "disposable-fixture" },
      commandLine: `${quote(process.execPath)} -e ${quote(code)} & wait`,
      timeoutMs: 10000,
      ...extra,
    });
  return {
    child,
    directory,
    events,
    marker,
    send,
    wait,
    run,
    async assertNoEffect() {
      const started = Number(await readFile(ready, "utf8"));
      await delay(Math.max(0, started + 1900 - Date.now()));
      await assert.rejects(readFile(marker), { code: "ENOENT" });
    },
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

for (const mode of ["cancel", "eof"] as const)
  test(
    `native bridge ${mode} stops a TERM-resistant shell descendant before later effects`,
    { timeout: 10000 },
    async () => {
      const fixture = await nativeFixture();
      try {
        fixture.run();
        await fixture.wait(
          (event) => event.type === "stdout" && event.data.includes("ready"),
        );
        if (mode === "cancel")
          fixture.send({ type: "command.cancel", taskId: "fixture" });
        if (mode === "eof") fixture.child.stdin.end();
        const terminal = await fixture.wait((event) =>
          ["command.done", "command.error"].includes(event.type),
        );
        assert.equal(terminal.event, "canceled");
        await fixture.assertNoEffect();
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

test(
  "native bridge keeps the case of a custom POSIX shell path",
  { skip: process.platform === "win32", timeout: 10000 },
  async () => {
    const fixture = await nativeFixture();
    try {
      const shell = join(fixture.directory, "Bin-Sh");
      await symlink("/bin/sh", shell);
      fixture.run({ shell, commandLine: "printf ok" });
      const terminal = await fixture.wait((event) =>
        ["command.done", "command.error"].includes(event.type),
      );
      assert.equal(terminal.type, "command.done", terminal.error);
    } finally {
      await fixture.close();
    }
  },
);

function extensionFixture() {
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
  mock.method(storage.localExecutionBridges, "update", async () => []);
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
          },
        };
        ports.push(port);
        return port;
      },
    },
  });
  return { sent, ports };
}

test("a bridge command runs without a ping or storage write and keeps only the output tail", async () => {
  const fixture = extensionFixture();
  const update = mock.method(
    storage.localExecutionBridges,
    "update",
    async () => [],
  );
  const running = runLocalCommand({ command: "fixture" });
  await delay(0);
  assert.deepEqual(
    fixture.sent.map((message) => message.type),
    ["command.run"],
  );
  const { taskId } = fixture.sent[0];
  const port = fixture.ports[0];
  for (let i = 0; i < 100; i++)
    port.onMessage.emit({ type: "stdout", taskId, data: "x".repeat(1024) });
  port.onMessage.emit({ type: "stdout", taskId, data: "end" });
  port.onMessage.emit({ type: "command.done", taskId });
  const result = await running;
  assert.equal(result.state, "done");
  assert.ok("output" in result && typeof result.output === "string");
  assert.equal(result.output.length, 64 * 1024);
  assert.ok(result.output.endsWith("end"));
  assert.equal(update.mock.callCount(), 0);
});

test("stopping the run cancels the command, disconnects and ignores late messages", async () => {
  const fixture = extensionFixture();
  const controller = new AbortController();
  const running = runLocalCommand({ command: "fixture" }, controller.signal);
  await delay(0);
  const { taskId } = fixture.sent[0];
  const port = fixture.ports[0];
  port.onMessage.emit({ type: "stdout", taskId, data: "line one\n" });
  controller.abort();
  assert.equal(fixture.sent.at(-1).type, "command.cancel");
  assert.equal(port.disconnected, true);
  port.onMessage.emit({ type: "command.error", taskId, error: "late" });
  await assert.rejects(running, { name: "AbortError" });
});

test("a background command keeps running, reports new output and can be cancelled", async () => {
  const fixture = extensionFixture();
  const call = (input: Record<string, unknown>) =>
    localCommandTool.execute(input, {
      run: { chatId: "chat" },
      toolCallId: "call",
      progress: () => {},
    } as never);
  const started = await call({ action: "start", command: "fixture" });
  const { taskId } = started.details as { taskId: string };
  assert.match(
    started.text,
    /: running[\s\S]*Still running: status with taskId and offset=0/,
  );
  const port = fixture.ports[0];
  port.onMessage.emit({ type: "stdout", taskId, data: "server ready\n" });
  const first = await call({ action: "status", taskId });
  assert.match(first.text, /server ready[\s\S]*offset=13/);
  port.onMessage.emit({ type: "stdout", taskId, data: "GET /\n" });
  const next = await call({ action: "status", taskId, offset: 13 });
  assert.ok(next.text.includes("GET /") && !next.text.includes("server ready"));
  const cancelled = await call({ action: "cancel", taskId });
  assert.match(cancelled.text, /: canceled/);
  assert.equal(cancelled.isError, false);
  assert.equal(fixture.sent.at(-1).type, "command.cancel");
});

test("the native host reports errors with the codes the extension reads", async () => {
  const fixture = await nativeFixture();
  try {
    const errorFor = (taskId: string) =>
      fixture.wait(
        (event) =>
          event.type === BRIDGE_MESSAGE.error && event.taskId === taskId,
      );
    fixture.send({
      type: BRIDGE_MESSAGE.run,
      taskId: "key",
      command: { key: "missing", secret: "disposable-fixture" },
      commandLine: "true",
    });
    assert.equal((await errorFor("key")).code, BRIDGE_ERROR.unknownShellConfig);
    fixture.send({
      type: BRIDGE_MESSAGE.run,
      taskId: "secret",
      command: { key: "fixture", secret: "wrong" },
      commandLine: "true",
    });
    assert.equal((await errorFor("secret")).code, BRIDGE_ERROR.badSecret);
    fixture.run({ taskId: "timeout", commandLine: "sleep 5", timeoutMs: 200 });
    assert.equal((await errorFor("timeout")).code, BRIDGE_ERROR.timeout);
    fixture.run({ taskId: "exit", commandLine: "exit 3" });
    assert.equal((await errorFor("exit")).code, BRIDGE_ERROR.exitCode);
    fixture.send({ type: "unknown" });
    const unknown = await fixture.wait(
      (event) => event.code === BRIDGE_ERROR.unknownMessage,
    );
    assert.equal(unknown.type, BRIDGE_MESSAGE.error);
  } finally {
    await fixture.close();
  }
});

test("a command runs with one timeout: the one asked for, else the bridge's, within the limits", async () => {
  const fixture = extensionFixture();
  const sentTimeout = async (timeoutMs?: unknown) => {
    const controller = new AbortController();
    const running = runLocalCommand(
      { command: "fixture", timeoutMs },
      controller.signal,
    );
    await delay(0);
    controller.abort();
    await running.catch(() => undefined);
    return fixture.sent.findLast((message) => message.type === "command.run")
      .timeoutMs;
  };
  assert.equal(
    await sentTimeout(),
    LOCAL_EXECUTION_BRIDGE_LIMITS.defaultTimeoutMs,
  );
  assert.equal(await sentTimeout(5_000), 5_000);
  assert.equal(
    await sentTimeout(10 * LOCAL_EXECUTION_BRIDGE_LIMITS.maxTimeoutMs),
    LOCAL_EXECUTION_BRIDGE_LIMITS.maxTimeoutMs,
  );
  assert.equal(
    await sentTimeout(1),
    LOCAL_EXECUTION_BRIDGE_LIMITS.minTimeoutMs,
  );
});

test("the extension's default host name is the one the installer registers", () => {
  assert.equal(HOST_NAME, LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME);
});
