import { CODE_RUN_LIMITS } from "../config";

// The code sandbox runs model-written code in a QuickJS interpreter inside a
// Worker. The same messages travel from the background to the host (the
// offscreen document, a background page), from the host into the sandbox
// page, and from there to the Worker. Limits live in CODE_RUN_LIMITS
// (src/shared/config.ts).

// JavaScript only for now; the protocol names the language so another
// interpreter (Python) can join behind the same messages.
export const CODE_LANGUAGE = {
  javascript: "javascript",
} as const;

export type CodeLanguage = (typeof CODE_LANGUAGE)[keyof typeof CODE_LANGUAGE];

export type CodeRunRequest = {
  id: string;
  language: CodeLanguage;
  code: string;
  // JSON value exposed as `input`.
  input?: unknown;
  // Text files `readFile` returns, by path.
  files: Record<string, string>;
  // The agent workspace `writeFile` saves to, as the size of each file in it
  // now: writes are held to the workspace's limits during the run. Absent:
  // the agent has no workspace and `writeFile` fails.
  workspaceFiles?: Record<string, number>;
  timeoutMs: number;
};

// Why a run ended early.
export const CODE_RUN_STOP = {
  timeout: "timeout",
  memory: "memory",
  // The host terminated the Worker: it did not answer by the deadline.
  killed: "killed",
  canceled: "canceled",
} as const;

export type CodeRunStop = (typeof CODE_RUN_STOP)[keyof typeof CODE_RUN_STOP];

export type CodeRunFile = { path: string; content: string };

// What kept the code apart from the extension: the sandboxed page (opaque
// origin, no network) around the interpreter, or the interpreter alone
// (Safari, Firefox before 154). Set by the host.
export const CODE_ISOLATION = {
  sandboxPage: "sandboxPage",
  interpreter: "interpreter",
} as const;

export type CodeIsolation =
  (typeof CODE_ISOLATION)[keyof typeof CODE_ISOLATION];

export type CodeRunResult = {
  // console output, in order.
  output: string;
  // Output, result or error was cut at CODE_RUN_LIMITS.outputMaxChars.
  outputTruncated: boolean;
  // The last expression's value as JSON (or its string form).
  value?: string;
  // The uncaught error with its stack, or why the run stopped.
  error?: string;
  stopped?: CodeRunStop;
  files: CodeRunFile[];
  durationMs: number;
  isolation?: CodeIsolation;
};

export const CODE_SANDBOX_MESSAGE = {
  // Host → sandbox page: the Worker's source and the compiled interpreter.
  init: "code-sandbox:init",
  ready: "code-sandbox:ready",
  run: "code-sandbox:run",
  cancel: "code-sandbox:cancel",
  result: "code-sandbox:result",
} as const;

export type CodeSandboxInit = {
  type: typeof CODE_SANDBOX_MESSAGE.init;
  workerSource: string;
  wasm: ArrayBuffer;
};

export type CodeSandboxReady = {
  type: typeof CODE_SANDBOX_MESSAGE.ready;
  // The page has an opaque origin: the browser applied `sandbox.pages`.
  isolated: boolean;
  error?: string;
};

export type CodeSandboxRun = {
  type: typeof CODE_SANDBOX_MESSAGE.run;
  request: CodeRunRequest;
};

export type CodeSandboxCancel = {
  type: typeof CODE_SANDBOX_MESSAGE.cancel;
  id: string;
};

export type CodeSandboxResult = {
  type: typeof CODE_SANDBOX_MESSAGE.result;
  id: string;
  result: CodeRunResult;
};

// Host → Worker: one run with the compiled interpreter.
export type CodeWorkerRun = {
  type: typeof CODE_SANDBOX_MESSAGE.run;
  module: WebAssembly.Module;
  request: CodeRunRequest;
};

export function codeRunTimeout(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(
        CODE_RUN_LIMITS.maxTimeoutMs,
        Math.max(CODE_RUN_LIMITS.minTimeoutMs, Math.round(number)),
      )
    : CODE_RUN_LIMITS.defaultTimeoutMs;
}

export function stoppedResult(
  stopped: CodeRunStop,
  error: string,
  durationMs = 0,
): CodeRunResult {
  return {
    output: "",
    outputTruncated: false,
    error,
    stopped,
    files: [],
    durationMs,
  };
}
