import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from "quickjs-emscripten-core";
import {
  CODE_RUN_LIMITS,
  WORKSPACE_FILE_MAX_CHARS,
  WORKSPACE_PATH_MAX_LENGTH,
  WORKSPACE_TOTAL_MAX_CHARS,
} from "../config";
import { errorMessage } from "../error-message";
import { readPath } from "../read-ids";
import { WORKSPACE_ERROR_TEXT } from "../workspace-errors";
import {
  CODE_RUN_STOP,
  type CodeRunRequest,
  type CodeRunResult,
  type CodeRunStop,
} from "./protocol";
import { guestString, type Budget } from "./guest-string";

// The guest's whole API, set up by guest code from three host functions so
// that the host functions themselves never become globals. Values print as
// compact JSON; errors with their stack. Returns the two functions the host
// turns the result and an uncaught error into text with, so neither is
// copied out of the interpreter before its length is checked.
const PRELUDE = `(function (write, read, save, inputJson) {
  "use strict";
  const json = (value) => {
    try {
      const text = JSON.stringify(value);
      return text === undefined ? String(value) : text;
    } catch {
      return String(value);
    }
  };
  const show = (value) =>
    typeof value === "string"
      ? value
      : value instanceof Error
        ? String(value) + (value.stack ? "\\n" + value.stack.trimEnd() : "")
        : json(value);
  const failure = (error) => {
    if (error && typeof error === "object" && "message" in error) {
      const head = String(error.name || "Error") + ": " + String(error.message);
      const stack = typeof error.stack === "string" ? error.stack.trimEnd() : "";
      return stack ? head + "\\n" + stack : head;
    }
    return "Uncaught " + (typeof error === "string" ? error : json(error));
  };
  const line = (...values) => write(values.map(show).join(" "));
  globalThis.console = Object.freeze({
    log: line, info: line, debug: line, warn: line, error: line,
  });
  globalThis.input = inputJson === undefined ? undefined : JSON.parse(inputJson);
  globalThis.readFile = (path) => read(String(path));
  globalThis.writeFile = (path, text) => {
    save(String(path), String(text));
  };
  return [json, failure];
})`;

type Collected = {
  output: string[];
  budget: Budget;
  files: Map<string, string>;
};

type Report = { json: QuickJSHandle; failure: QuickJSHandle };

// Runs one request in a fresh QuickJS runtime. Synchronous: the caller (a
// Worker) is blocked until the code ends, fails or is interrupted.
export function runJavaScript(
  quickjs: QuickJSWASMModule,
  request: CodeRunRequest,
): CodeRunResult {
  const started = performance.now();
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(CODE_RUN_LIMITS.memoryBytes);
  runtime.setMaxStackSize(CODE_RUN_LIMITS.stackBytes);
  let deadline = Date.now() + request.timeoutMs;
  let interrupted = false;
  runtime.setInterruptHandler(() => (interrupted ||= Date.now() > deadline));
  const context = runtime.newContext();
  const collected: Collected = {
    output: [],
    budget: { left: CODE_RUN_LIMITS.outputMaxChars, cut: false },
    files: new Map(),
  };
  let value: string | undefined;
  let error: string | undefined;
  let stopped: CodeRunStop | undefined;
  try {
    const report = install(context, request, collected);
    const outcome = evaluate(context, runtime, request.code);
    // The code's time is up; turning its result or error into text gets a
    // short deadline of its own (getters and toJSON run guest code).
    const timedOut = interrupted;
    deadline = Date.now() + CODE_RUN_LIMITS.reportMs;
    interrupted = false;
    let thrown = "error" in outcome ? outcome.error : undefined;
    if ("value" in outcome && context.typeof(outcome.value) === "undefined")
      outcome.value.dispose();
    else if ("value" in outcome) {
      const text = describe(context, report.json, outcome.value, collected);
      if ("error" in text) thrown = text.error;
      else value = text.value;
    }
    if (thrown) {
      const text = describe(context, report.failure, thrown, collected);
      error =
        "value" in text
          ? text.value
          : "The code failed with an error that could not be read.";
    }
    if (typeof outcome.reason === "string") error = outcome.reason;
    report.json.dispose();
    report.failure.dispose();
    if (error !== undefined) {
      if (timedOut) stopped = CODE_RUN_STOP.timeout;
      else if (/^InternalError: out of memory/.test(error))
        stopped = CODE_RUN_STOP.memory;
    }
  } catch (cause) {
    // The browser's own stack or memory gave out while the interpreter ran
    // (deep recursion inside a built-in such as JSON.stringify).
    const message = errorMessage(cause);
    error = `The sandbox stopped the code: ${message}`;
    if (/memory/i.test(message)) stopped = CODE_RUN_STOP.memory;
  }
  release(context, runtime);
  return {
    output: collected.output.join("\n"),
    outputTruncated: collected.budget.cut,
    ...(value !== undefined ? { value } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(stopped ? { stopped } : {}),
    files: [...collected.files].map(([path, content]) => ({ path, content })),
    durationMs: Math.round(performance.now() - started),
  };
}

// The text `fn` makes of `handle` (consumed), cut to what the budget has
// left, but never below CODE_RUN_LIMITS.reportMinChars.
function describe(
  context: QuickJSContext,
  fn: QuickJSHandle,
  handle: QuickJSHandle,
  collected: Collected,
): { value: string } | { error: QuickJSHandle } {
  const result = context.callFunction(fn, context.undefined, handle);
  handle.dispose();
  if (result.error) return { error: result.error };
  const budget = collected.budget;
  const room = Math.max(budget.left, CODE_RUN_LIMITS.reportMinChars);
  const text = guestString(context, result.value, room);
  result.value.dispose();
  budget.left = Math.max(0, budget.left - text.text.length);
  budget.cut ||= text.cut;
  return { value: text.text };
}

function install(
  context: QuickJSContext,
  request: CodeRunRequest,
  collected: Collected,
): Report {
  const write = context.newFunction("write", (handle) => {
    const budget = collected.budget;
    if (budget.cut) return;
    const line = guestString(context, handle, budget.left);
    collected.output.push(line.text);
    budget.left = Math.max(0, budget.left - line.text.length - 1);
    budget.cut = line.cut;
  });
  const read = context.newFunction("read", (handle) => {
    const name = guestString(context, handle, WORKSPACE_PATH_MAX_LENGTH).text;
    if (Object.hasOwn(request.files, name))
      return context.newString(request.files[name]);
    const listed = Object.keys(request.files);
    return {
      error: context.newError(
        `No file "${name}" was passed to this run. ${
          listed.length
            ? `Files: ${listed.join(", ")}.`
            : "List workspace files in the files argument to read them."
        }`,
      ),
    };
  });
  const save = context.newFunction("save", (pathHandle, textHandle) => {
    const failure = saveFile(
      context,
      request,
      collected,
      pathHandle,
      textHandle,
    );
    if (failure) return { error: context.newError(failure) };
  });
  const input =
    request.input === undefined
      ? context.undefined
      : context.newString(JSON.stringify(request.input));
  const prelude = context.unwrapResult(
    context.evalCode(PRELUDE, "prelude.js", { type: "global", strict: true }),
  );
  const pair = context.unwrapResult(
    context.callFunction(prelude, context.undefined, write, read, save, input),
  );
  const report = {
    json: context.getProp(pair, 0),
    failure: context.getProp(pair, 1),
  };
  for (const handle of [pair, prelude, write, read, save, input])
    handle.dispose();
  return report;
}

// Keeps a file `writeFile` wrote, held to the workspace's limits (per file
// and in total with the files already there) so the code learns of a file
// too large while it runs. Returns why it was refused.
function saveFile(
  context: QuickJSContext,
  request: CodeRunRequest,
  collected: Collected,
  pathHandle: QuickJSHandle,
  textHandle: QuickJSHandle,
) {
  const existing = request.workspaceFiles;
  if (!existing)
    return "writeFile needs an agent workspace; this agent has none. Print the result instead.";
  const path = guestString(context, pathHandle, WORKSPACE_PATH_MAX_LENGTH);
  if (path.cut) return WORKSPACE_ERROR_TEXT.pathTooLong;
  const content = guestString(context, textHandle, WORKSPACE_FILE_MAX_CHARS);
  if (content.cut) return WORKSPACE_ERROR_TEXT.fileTooLarge;
  const key = readPath(path.text) || path.text;
  const sizes = new Map(Object.entries(existing));
  for (const [name, text] of collected.files)
    sizes.set(readPath(name) || name, text.length);
  sizes.set(key, content.text.length);
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  if (total > WORKSPACE_TOTAL_MAX_CHARS)
    return WORKSPACE_ERROR_TEXT.workspaceTooLarge;
  collected.files.set(path.text, content.text);
  return undefined;
}

// The value of the code's last expression; a promise is awaited by running
// the interpreter's job queue (there are no timers to wait for). The thrown
// value stays a handle until the guest has turned it into text.
function evaluate(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  code: string,
):
  | { value: QuickJSHandle; reason?: never }
  | { error: QuickJSHandle; reason?: never }
  | { reason: string } {
  const result = context.evalCode(code, "code.js", { type: "global" });
  if (result.error) return { error: result.error };
  const jobs = runtime.executePendingJobs();
  if (jobs.error) {
    result.value.dispose();
    return { error: jobs.error };
  }
  const state = context.getPromiseState(result.value);
  if (state.type === "fulfilled") {
    if (state.notAPromise) return { value: result.value };
    result.value.dispose();
    return { value: state.value };
  }
  result.value.dispose();
  if (state.type === "rejected") return { error: state.error };
  return {
    reason:
      "The code returned a promise that never settled: the sandbox has no timers, network or other sources of events.",
  };
}

// A run that hit a limit can leave the runtime unable to free itself; the
// Worker is discarded after the run either way.
function release(context: QuickJSContext, runtime: QuickJSRuntime) {
  try {
    context.dispose();
    runtime.dispose();
  } catch {
    // Nothing to free beyond the Worker.
  }
}
