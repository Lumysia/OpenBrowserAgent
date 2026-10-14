import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { CODE_RUN_LIMITS } from "../src/shared/config";
import { codeSandbox } from "../src/shared/code-sandbox/host";
import { hasCodeSandboxPage } from "../src/shared/code-sandbox/paths";
import {
  CODE_LANGUAGE,
  CODE_SANDBOX_MESSAGE,
  type CodeRunRequest,
  type CodeRunResult,
} from "../src/shared/code-sandbox/protocol";
import {
  createRunQueue,
  type CodeRunner,
} from "../src/shared/code-sandbox/run-queue";

// The host's sandboxed-page lifecycle with a stand-in page: a page that does
// not start fails the run (no silent fallback), a page that stops answering
// is rebuilt for the next run, and only a page without an opaque origin
// leaves the Worker to the host page.

const request = (id: string, timeoutMs = 1_000): CodeRunRequest => ({
  id,
  language: CODE_LANGUAGE.javascript,
  code: "1",
  files: {},
  timeoutMs,
});

const done = (value: string): CodeRunResult => ({
  output: "",
  outputTruncated: false,
  value,
  files: [],
  durationMs: 1,
});

// How the next stand-in pages behave.
const page = {
  ready: "isolated" as "isolated" | "notIsolated" | "silent",
  answers: true,
};
const frames: FakeFrame[] = [];
const ports: MessagePort[] = [];
let workers = 0;

class FakeFrame {
  hidden = false;
  src = "";
  removed = false;
  private onload?: () => void;
  behavior = { ...page };
  addEventListener(type: string, listener: () => void) {
    if (type === "load") this.onload = listener;
  }
  remove() {
    this.removed = true;
  }
  load() {
    this.onload?.();
  }
  contentWindow = {
    postMessage: (_init: unknown, _target: string, [port]: MessagePort[]) => {
      ports.push(port);
      if (this.behavior.ready === "silent") return;
      port.onmessage = (event: MessageEvent) => {
        const { type, request: run } = event.data;
        if (type === CODE_SANDBOX_MESSAGE.run && this.behavior.answers)
          port.postMessage({
            type: CODE_SANDBOX_MESSAGE.result,
            id: run.id,
            result: done(run.id),
          });
      };
      port.postMessage({
        type: CODE_SANDBOX_MESSAGE.ready,
        isolated: this.behavior.ready === "isolated",
      });
    },
  };
}

Object.assign(globalThis, {
  chrome: { runtime: { getURL: (path: string) => `ext://${path}` } },
  // An empty but valid WebAssembly module.
  fetch: async () => ({
    arrayBuffer: async () =>
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]).buffer,
    text: async () => "",
  }),
  document: {
    createElement: () => new FakeFrame(),
    body: {
      append(frame: FakeFrame) {
        frames.push(frame);
        setImmediate(() => frame.load());
      },
    },
  },
  Worker: class {
    onmessage: ((event: { data: CodeRunResult }) => void) | null = null;
    constructor() {
      workers += 1;
    }
    postMessage() {
      setImmediate(() => this.onmessage?.({ data: done("worker") }));
    }
    terminate() {}
  },
});

after(() => {
  for (const port of ports) port.close();
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a page that does not start fails the run after one retry", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    page.ready = "silent";
    const run = codeSandbox(true).run(request("silent"));
    const failed = assert.rejects(run, /code sandbox page could not start/);
    for (let attempt = 0; attempt < 2; attempt++) {
      while (frames.length <= attempt) await settle();
      await settle();
      mock.timers.tick(CODE_RUN_LIMITS.frameReadyTimeoutMs);
    }
    await failed;
    assert.equal(frames.length, 2);
    assert.ok(frames.every((frame) => frame.removed));
    assert.equal(workers, 0);
  } finally {
    mock.timers.reset();
  }
});

test("the next run builds the page again", async () => {
  page.ready = "isolated";
  const result = await codeSandbox(true).run(request("ok"));
  assert.equal(result.value, "ok");
  assert.equal(result.isolation, "sandboxPage");
  assert.equal(frames.length, 3);
});

// Makes the live page stop answering and lets the host find out.
async function killPage(sandbox: CodeRunner) {
  frames[frames.length - 1].behavior.answers = false;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const hung = sandbox.run(request("hung", 100));
    await settle();
    mock.timers.tick(
      100 + CODE_RUN_LIMITS.watchdogGraceMs + CODE_RUN_LIMITS.frameReplyGraceMs,
    );
    return await hung;
  } finally {
    mock.timers.reset();
  }
}

test("a page that stops answering is removed and rebuilt", async () => {
  const sandbox = codeSandbox(true);
  const result = await killPage(sandbox);
  assert.equal(result.stopped, "killed");
  assert.match(result.error || "", /stopped answering/);
  assert.equal(frames[2].removed, true);
  const next = await sandbox.run(request("again"));
  assert.equal(next.value, "again");
  assert.equal(next.isolation, "sandboxPage");
  assert.equal(frames.length, 4);
  assert.equal(workers, 0);
});

test("the run queue limits runs at once and rejects duplicate ids", async () => {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const inner: CodeRunner = {
    run: (item) =>
      new Promise((resolve) => {
        started.push(item.id);
        finish.set(item.id, () => resolve(done(item.id)));
      }),
    cancel: () => undefined,
  };
  const queue = createRunQueue(2, inner);
  const runs = ["a", "b", "c", "d"].map((id) => queue.run(request(id)));
  await assert.rejects(queue.run(request("a")), /already going/);
  assert.deepEqual(started, ["a", "b"]);
  queue.cancel("d");
  assert.equal((await runs[3]).stopped, "canceled");
  finish.get("a")?.();
  await runs[0];
  await settle();
  assert.deepEqual(started, ["a", "b", "c"]);
  finish.get("b")?.();
  finish.get("c")?.();
  assert.deepEqual(
    (await Promise.all(runs.slice(0, 3))).map((result) => result.value),
    ["a", "b", "c"],
  );
});

test("only a page without an opaque origin hands runs to a plain Worker", async () => {
  const sandbox = codeSandbox(true);
  await killPage(sandbox);
  page.ready = "notIsolated";
  const result = await sandbox.run(request("plain"));
  assert.equal(result.value, "worker");
  assert.equal(result.isolation, "interpreter");
  assert.equal(frames.length, 5);
  assert.equal(frames[4].removed, true);
  assert.equal(workers, 1);
});

test("the manifest says whether the sandboxed page exists", () => {
  assert.equal(
    hasCodeSandboxPage({ sandbox: { pages: ["code-sandbox.html"] } }),
    true,
  );
  assert.equal(hasCodeSandboxPage({}), false);
});
