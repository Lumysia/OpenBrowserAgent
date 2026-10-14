import { getBrowserApi } from "../browser-api";
import { CODE_RUN_LIMITS } from "../config";
import { errorMessage } from "../error-message";
import { startFrame } from "./frame-runner";
import { CODE_SANDBOX_PATH } from "./paths";
import { CODE_ISOLATION, CODE_SANDBOX_MESSAGE } from "./protocol";
import { createRunQueue, type CodeRunner } from "./run-queue";
import { createWorkerRunner } from "./worker-runner";

let sandbox: CodeRunner | undefined;
let current: Promise<CodeRunner> | undefined;
let generation = 0;

// The code runner of an extension page with a DOM (Chrome's offscreen
// document, the background page of Firefox and Safari). `sandboxPage`: the
// manifest lists the sandboxed page; it is the same for every call of one
// extension build. With it, runs go through that page, and a page that does
// not start fails the run: the host never drops the page's isolation on its
// own. Only a page the browser did not sandbox (no opaque origin), or a
// manifest without the page (Safari), runs the Worker from this page, where
// the interpreter is the only boundary.
export function codeSandbox(sandboxPage: boolean): CodeRunner {
  sandbox ??= createRunQueue(CODE_RUN_LIMITS.maxConcurrent, {
    run: async (request) => (await host(sandboxPage)).run(request),
    cancel: (id) => {
      current?.then((runner) => runner.cancel(id)).catch(() => undefined);
    },
  });
  return sandbox;
}

// Stops a queued or running run; nothing to do before the first run.
export function cancelSandboxRun(id: string) {
  sandbox?.cancel(id);
}

function host(sandboxPage: boolean) {
  if (current) return current;
  const own = ++generation;
  const reset = () => {
    if (generation === own) current = undefined;
  };
  current = startHost(sandboxPage, reset).catch((error) => {
    reset();
    throw error;
  });
  return current;
}

async function startHost(
  sandboxPage: boolean,
  onDead: () => void,
): Promise<CodeRunner> {
  const runtime = getBrowserApi().runtime;
  const wasm = await (
    await fetch(runtime.getURL(`/${CODE_SANDBOX_PATH.wasm}`))
  ).arrayBuffer();
  if (sandboxPage) {
    const init = {
      type: CODE_SANDBOX_MESSAGE.init,
      workerSource: await (
        await fetch(runtime.getURL(`/${CODE_SANDBOX_PATH.worker}`))
      ).text(),
      wasm,
    } as const;
    // A page that failed to start gets one more try from scratch.
    const frame = await startFrame(init, onDead)
      .catch(() => startFrame(init, onDead))
      .catch((error) => {
        throw new Error(
          `The code sandbox page could not start: ${errorMessage(error)}`,
        );
      });
    if (frame) return frame;
  }
  const module = await WebAssembly.compile(wasm);
  const url = runtime.getURL(`/${CODE_SANDBOX_PATH.worker}`);
  const runner = createWorkerRunner(() => new Worker(url), module);
  return {
    run: async (request) => ({
      ...(await runner.run(request)),
      isolation: CODE_ISOLATION.interpreter,
    }),
    cancel: runner.cancel,
  };
}
