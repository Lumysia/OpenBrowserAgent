import type {
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
  QuickJSWASMModule,
} from "quickjs-emscripten-core";
import {
  CODE_RUN_LIMITS,
  CODE_RUN_STOP,
  type CodeRunRequest,
  type CodeRunResult,
  type CodeRunStop,
} from "./protocol";

// The guest's whole API, set up by guest code from three host functions so
// that the host functions themselves never become globals. Values print as
// compact JSON; errors with their stack.
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
  const line = (...values) => write(values.map(show).join(" "));
  globalThis.console = Object.freeze({
    log: line, info: line, debug: line, warn: line, error: line,
  });
  globalThis.input = inputJson === undefined ? undefined : JSON.parse(inputJson);
  globalThis.readFile = (path) => read(String(path));
  globalThis.writeFile = (path, text) => {
    save(String(path), String(text));
  };
  return json;
})`;

type Collected = {
  output: string[];
  outputChars: number;
  outputTruncated: boolean;
  files: Map<string, string>;
  filesChars: number;
};

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
  const deadline = Date.now() + request.timeoutMs;
  let interrupted = false;
  runtime.setInterruptHandler(() => (interrupted ||= Date.now() > deadline));
  const context = runtime.newContext();
  const collected: Collected = {
    output: [],
    outputChars: 0,
    outputTruncated: false,
    files: new Map(),
    filesChars: 0,
  };
  let value: string | undefined;
  let error: string | undefined;
  let stopped: CodeRunStop | undefined;
  try {
    const json = install(context, request, collected);
    let outcome = evaluate(context, runtime, request.code);
    if ("value" in outcome && context.typeof(outcome.value) === "undefined")
      outcome.value.dispose();
    else if ("value" in outcome) {
      const text = context.callFunction(json, context.undefined, outcome.value);
      outcome.value.dispose();
      if (text.error) outcome = { error: errorText(context, text.error) };
      else {
        value = context.getString(text.value);
        text.value.dispose();
      }
    }
    json.dispose();
    if ("error" in outcome) {
      error = outcome.error;
      if (interrupted) stopped = CODE_RUN_STOP.timeout;
      else if (/^InternalError: out of memory/.test(outcome.error))
        stopped = CODE_RUN_STOP.memory;
    }
  } catch (cause) {
    // The browser's own stack or memory gave out while the interpreter ran
    // (deep recursion inside a built-in such as JSON.stringify).
    const message = cause instanceof Error ? cause.message : String(cause);
    error = `The sandbox stopped the code: ${message}`;
    if (/memory/i.test(message)) stopped = CODE_RUN_STOP.memory;
  }
  release(context, runtime);
  return {
    output: collected.output.join("\n"),
    outputTruncated: collected.outputTruncated,
    ...(value !== undefined ? { value } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(stopped ? { stopped } : {}),
    files: [...collected.files].map(([path, content]) => ({ path, content })),
    durationMs: Math.round(performance.now() - started),
  };
}

function install(
  context: QuickJSContext,
  request: CodeRunRequest,
  collected: Collected,
) {
  const write = context.newFunction("write", (text) => {
    if (collected.outputTruncated) return;
    const line = context.getString(text);
    const room = CODE_RUN_LIMITS.outputMaxChars - collected.outputChars;
    if (line.length > room) {
      collected.output.push(line.slice(0, Math.max(0, room)));
      collected.outputTruncated = true;
    } else collected.output.push(line);
    collected.outputChars += line.length + 1;
  });
  const read = context.newFunction("read", (path) => {
    const name = context.getString(path);
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
  const save = context.newFunction("save", (path, text) => {
    if (!request.canWrite)
      return {
        error: context.newError(
          "writeFile needs an agent workspace; this agent has none. Print the result instead.",
        ),
      };
    const name = context.getString(path);
    const content = context.getString(text);
    const previous = collected.files.get(name)?.length ?? 0;
    const total = collected.filesChars - previous + content.length;
    if (total > CODE_RUN_LIMITS.filesMaxChars)
      return {
        error: context.newError(
          `Files written by one run may hold at most ${CODE_RUN_LIMITS.filesMaxChars} characters.`,
        ),
      };
    collected.files.set(name, content);
    collected.filesChars = total;
  });
  const input =
    request.input === undefined
      ? context.undefined
      : context.newString(JSON.stringify(request.input));
  const prelude = context.unwrapResult(
    context.evalCode(PRELUDE, "prelude.js", { type: "global", strict: true }),
  );
  const json = context.unwrapResult(
    context.callFunction(prelude, context.undefined, write, read, save, input),
  );
  for (const handle of [prelude, write, read, save, input]) handle.dispose();
  return json;
}

// The value of the code's last expression; a promise is awaited by running
// the interpreter's job queue (there are no timers to wait for).
function evaluate(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  code: string,
): { value: QuickJSHandle } | { error: string } {
  const result = context.evalCode(code, "code.js", { type: "global" });
  if (result.error) return { error: errorText(context, result.error) };
  const jobs = runtime.executePendingJobs();
  if (jobs.error) {
    result.value.dispose();
    return { error: errorText(context, jobs.error) };
  }
  const state = context.getPromiseState(result.value);
  if (state.type === "fulfilled") {
    if (state.notAPromise) return { value: result.value };
    result.value.dispose();
    return { value: state.value };
  }
  result.value.dispose();
  if (state.type === "rejected")
    return { error: errorText(context, state.error) };
  return {
    error:
      "The code returned a promise that never settled: the sandbox has no timers, network or other sources of events.",
  };
}

function errorText(context: QuickJSContext, handle: QuickJSHandle) {
  const error = context.dump(handle);
  handle.dispose();
  if (error && typeof error === "object" && "message" in error) {
    const { name, message, stack } = error as Record<string, unknown>;
    const head = `${name || "Error"}: ${message}`;
    return typeof stack === "string" && stack.trim()
      ? `${head}\n${stack.trimEnd()}`
      : head;
  }
  return `Uncaught ${typeof error === "string" ? error : JSON.stringify(error)}`;
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
