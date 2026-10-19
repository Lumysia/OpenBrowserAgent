import assert from "node:assert/strict";
import { before, test } from "node:test";
import ng from "@jitl/quickjs-ng-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import { runCodeText } from "../src/background/tools/run-code-text";
import { runJavaScript } from "../src/shared/code-sandbox/engine";
import {
  CODE_RUN_LIMITS,
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_TOTAL_MAX_CHARS,
} from "../src/shared/config";
import { WORKSPACE_ERROR_TEXT } from "../src/shared/workspace-errors";
import {
  CODE_LANGUAGE,
  CODE_READ_ONLY_WRITE_ERROR,
  CODE_SANDBOX_MESSAGE,
  codeRunTimeout,
  type CodeRunRequest,
  type CodeWorkerRun,
} from "../src/shared/code-sandbox/protocol";
import { createWorkerRunner } from "../src/shared/code-sandbox/worker-runner";

// The interpreter, its guest API and the host's Worker protocol, with the
// same QuickJS build the extension ships.
let quickjs: QuickJSWASMModule;
before(async () => {
  quickjs = await newQuickJSWASMModuleFromVariant(ng);
});

const request = (
  code: string,
  extra: Partial<CodeRunRequest> = {},
): CodeRunRequest => ({
  id: "run",
  language: CODE_LANGUAGE.javascript,
  code,
  files: {},
  timeoutMs: 2_000,
  ...extra,
});

const run = (code: string, extra: Partial<CodeRunRequest> = {}) =>
  runJavaScript(quickjs, request(code, extra));

test("returns console output and the last value as JSON", () => {
  const result = run(
    `console.log("rows", 2, { a: [1, 2] }); console.error(new TypeError("soft")); ({ sum: input.a + input.b })`,
    { input: { a: 2, b: 3 } },
  );
  assert.equal(result.error, undefined);
  assert.match(result.output, /^rows 2 \{"a":\[1,2\]\}\nTypeError: soft/);
  assert.equal(result.value, '{"sum":5}');
  assert.equal(typeof result.durationMs, "number");
});

test("an undefined last value is left out; promises are awaited", () => {
  assert.equal(run("let x = 1;").value, undefined);
  assert.equal(run("Promise.resolve(41).then((n) => n + 1)").value, "42");
  assert.match(
    run("(async () => { throw new RangeError('late') })()").error || "",
    /^RangeError: late/,
  );
  assert.match(
    run("new Promise(() => {})").error || "",
    /promise that never settled/,
  );
});

test("readFile reads only the files passed in", () => {
  const files = { "data.csv": "a,b\n1,2\n3,4\n" };
  const sum = run(
    `readFile("data.csv").trim().split("\\n").slice(1).map((row) => Number(row.split(",")[1])).reduce((a, b) => a + b)`,
    { files },
  );
  assert.equal(sum.value, "6");
  const missing = run(`readFile("other.txt")`, { files });
  assert.match(missing.error || "", /No file "other\.txt".*Files: data\.csv/);
});

test("writeFile returns files to the host, only with a workspace", () => {
  const written = run(
    `writeFile("out/a.txt", "one"); writeFile("out/a.txt", 2); writeFile("b.json", JSON.stringify([1]))`,
    { workspaceFiles: {} },
  );
  assert.equal(written.error, undefined);
  assert.deepEqual(written.files, [
    { path: "out/a.txt", content: "2" },
    { path: "b.json", content: "[1]" },
  ]);
  const denied = run(`writeFile("a.txt", "x")`);
  assert.match(denied.error || "", /writeFile needs an agent workspace/);
  assert.deepEqual(denied.files, []);
  const readOnly = run(`writeFile("MEMORY.md", "x")`, {
    workspaceFiles: {},
    readOnly: true,
  });
  assert.equal(
    readOnly.error?.split("\n")[0],
    `Error: ${CODE_READ_ONLY_WRITE_ERROR}`,
  );
  assert.deepEqual(readOnly.files, []);
});

test("the guest has no host functions, network, timers or extension APIs", () => {
  const result = run(
    `["fetch", "XMLHttpRequest", "setTimeout", "chrome", "browser", "window", "document", "write", "read", "save"].filter((name) => typeof globalThis[name] !== "undefined")`,
  );
  assert.equal(result.value, "[]");
});

test("an endless loop is interrupted at the deadline", () => {
  const result = run("while (true) {}", { timeoutMs: 300 });
  assert.equal(result.stopped, "timeout");
  assert.match(result.error || "", /^InternalError: interrupted/);
  assert.ok(result.durationMs >= 290 && result.durationMs < 2_000);
});

test("memory and stack limits fail cleanly", () => {
  const memory = run(`"x".repeat(2 ** 29).length`);
  assert.equal(memory.stopped, "memory");
  assert.match(memory.error || "", /^InternalError: out of memory/);
  const stack = run("function f() { return f() + 1 } f()");
  assert.match(stack.error || "", /^RangeError: Maximum call stack size/);
  assert.equal(run("1 + 1").value, "2");
});

test("output is capped", () => {
  const result = run(
    `const line = "x".repeat(100000); for (let i = 0; i < 12; i++) console.log(line)`,
  );
  assert.equal(result.outputTruncated, true);
  assert.equal(result.output.length, CODE_RUN_LIMITS.outputMaxChars);
});

test("the result and the error share the output budget", () => {
  const value = run(`"x".repeat(5_000_000)`);
  assert.equal(value.outputTruncated, true);
  assert.equal(value.value?.length, CODE_RUN_LIMITS.outputMaxChars);
  const thrown = run(`throw "y".repeat(5_000_000)`);
  assert.equal(thrown.outputTruncated, true);
  assert.ok(thrown.error?.startsWith("Uncaught yyy"));
  assert.equal(thrown.error?.length, CODE_RUN_LIMITS.outputMaxChars);
  // Printing used the budget up: the error still shows its head.
  const after = run(
    `const line = "x".repeat(100000); for (let i = 0; i < 12; i++) console.log(line); throw new Error("z".repeat(5000))`,
  );
  assert.equal(after.output.length, CODE_RUN_LIMITS.outputMaxChars);
  assert.equal(after.error?.length, CODE_RUN_LIMITS.reportMinChars);
  assert.match(after.error || "", /^Error: zzz/);
});

test("a timed-out run still reports its error", () => {
  const result = run(`try { while (true) {} } finally { }`, { timeoutMs: 200 });
  assert.equal(result.stopped, "timeout");
  assert.match(result.error || "", /^InternalError: interrupted/);
});

test("writeFile is held to the workspace limits during the run", () => {
  const tooBig = run(
    `try { writeFile("a.txt", "x".repeat(${WORKSPACE_FILE_MAX_CHARS + 1})) } catch (error) { error.message }`,
    { workspaceFiles: {} },
  );
  assert.equal(tooBig.value, JSON.stringify(WORKSPACE_ERROR_TEXT.fileTooLarge));
  assert.deepEqual(tooBig.files, []);
  const half = WORKSPACE_TOTAL_MAX_CHARS / 2;
  const full = run(
    `writeFile("b.txt", "x".repeat(${half})); try { writeFile("c.txt", "x") } catch (error) { error.message }`,
    { workspaceFiles: { "a.txt": half } },
  );
  assert.equal(
    full.value,
    JSON.stringify(WORKSPACE_ERROR_TEXT.workspaceTooLarge),
  );
  assert.deepEqual(
    full.files.map((file) => file.path),
    ["b.txt"],
  );
  // Replacing a file counts its new size only.
  const replaced = run(`writeFile("/a.txt", "x".repeat(${half})); 1`, {
    workspaceFiles: { "a.txt": half, "b.txt": half },
  });
  assert.equal(replaced.error, undefined);
  assert.equal(replaced.files[0].content.length, half);
});

test("timeouts are clamped", () => {
  assert.equal(codeRunTimeout(undefined), CODE_RUN_LIMITS.defaultTimeoutMs);
  assert.equal(codeRunTimeout(99_999), CODE_RUN_LIMITS.maxTimeoutMs);
  assert.equal(codeRunTimeout(1), CODE_RUN_LIMITS.minTimeoutMs);
  assert.equal(codeRunTimeout("1500"), 1_500);
});

// A stand-in for a browser Worker: answers with the engine, or never.
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private behavior: "engine" | "hang" | "crash") {}
  postMessage(message: CodeWorkerRun) {
    assert.equal(message.type, CODE_SANDBOX_MESSAGE.run);
    if (this.behavior === "hang") return;
    queueMicrotask(() => {
      if (this.behavior === "crash")
        return this.onerror?.({
          message: "boom",
          preventDefault() {},
        } as ErrorEvent);
      this.onmessage?.({
        data: runJavaScript(quickjs, message.request),
      } as MessageEvent);
    });
  }
  terminate() {
    this.terminated = true;
  }
}

function runner(behavior: FakeWorker["behavior"]) {
  const workers: FakeWorker[] = [];
  const instance = createWorkerRunner(() => {
    const worker = new FakeWorker(behavior);
    workers.push(worker);
    return worker as unknown as Worker;
  }, {} as WebAssembly.Module);
  return { instance, workers };
}

test("each run gets a new Worker, terminated after it answers", async () => {
  const { instance, workers } = runner("engine");
  const first = await instance.run(request("1 + 1", { id: "a" }));
  const second = await instance.run(request("2 + 2", { id: "b" }));
  assert.equal(first.value, "2");
  assert.equal(second.value, "4");
  assert.equal(workers.length, 2);
  assert.ok(workers.every((worker) => worker.terminated));
});

test("the watchdog kills a Worker that does not answer", async () => {
  const { instance, workers } = runner("hang");
  const started = Date.now();
  const result = await instance.run(request("0", { timeoutMs: 100 }));
  assert.equal(result.stopped, "killed");
  assert.match(result.error || "", /did not stop at its 100 ms limit/);
  assert.ok(Date.now() - started >= 100 + CODE_RUN_LIMITS.watchdogGraceMs);
  assert.equal(workers[0].terminated, true);
});

test("cancel and Worker errors end the run", async () => {
  const hanging = runner("hang");
  const pending = hanging.instance.run(request("0", { id: "stop" }));
  hanging.instance.cancel("stop");
  assert.equal((await pending).stopped, "canceled");
  assert.equal(hanging.workers[0].terminated, true);
  const crashing = runner("crash");
  const crashed = await crashing.instance.run(request("0"));
  assert.equal(crashed.stopped, "killed");
  assert.match(crashed.error || "", /The sandbox failed: boom/);
});

test("the model is told where the output was cut, with the real limit", () => {
  const text = runCodeText(
    {
      output: "x".repeat(10),
      outputTruncated: true,
      value: '"y"',
      files: [],
      durationMs: 5,
    },
    { written: [{ path: "out/a.txt", chars: 3 }], failed: [] },
  );
  assert.ok(
    text.startsWith(
      `[The code ran in 5 ms]\n[Output cut: a run returns at most ${CODE_RUN_LIMITS.outputMaxChars} characters`,
    ),
  );
  assert.match(text, /\nOutput:\nx{10}\nResult: "y"/);
  assert.ok(!text.includes("${"));
  assert.match(text, /Wrote workspace:out\/a\.txt \(3 chars\)\./);
});
