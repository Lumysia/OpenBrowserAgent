import { getBrowserApi } from "../browser-api";
import { CODE_SANDBOX_PATH } from "./paths";
import {
  CODE_ISOLATION,
  CODE_RUN_LIMITS,
  CODE_RUN_STOP,
  CODE_SANDBOX_MESSAGE,
  stoppedResult,
  type CodeRunResult,
  type CodeSandboxInit,
  type CodeSandboxReady,
  type CodeSandboxResult,
} from "./protocol";
import { createWorkerRunner, type CodeRunner } from "./worker-runner";

// How long the sandbox page may take to load and compile the interpreter.
const FRAME_READY_TIMEOUT_MS = 15_000;
// Extra time the host waits for the sandbox page beyond the Worker's own
// watchdog before it gives the run up.
const FRAME_REPLY_GRACE_MS = 3_000;

let host: Promise<CodeRunner> | undefined;

// The code runner of an extension page with a DOM (Chrome's offscreen
// document, the background page of Firefox and Safari). Where the browser
// supports sandboxed pages, runs go through one; otherwise (Safari, Firefox
// before 154) the Worker runs from this page and the interpreter is the only
// boundary. `sandboxPage`: the manifest lists the sandboxed page (offscreen
// documents cannot read the manifest, so the caller says).
export function codeHost(sandboxPage: boolean) {
  host ??= createHost(sandboxPage).catch((error) => {
    host = undefined;
    throw error;
  });
  return host;
}

async function createHost(sandboxPage: boolean): Promise<CodeRunner> {
  const runtime = getBrowserApi().runtime;
  const wasm = await (
    await fetch(runtime.getURL(`/${CODE_SANDBOX_PATH.wasm}`))
  ).arrayBuffer();
  if (sandboxPage) {
    const workerSource = await (
      await fetch(runtime.getURL(`/${CODE_SANDBOX_PATH.worker}`))
    ).text();
    const frame = await frameRunner({
      type: CODE_SANDBOX_MESSAGE.init,
      workerSource,
      wasm: wasm.slice(0),
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

// Undefined when the page did not get an opaque origin: the browser ignored
// `sandbox.pages`.
async function frameRunner(
  init: CodeSandboxInit,
): Promise<CodeRunner | undefined> {
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  iframe.src = getBrowserApi().runtime.getURL(`/${CODE_SANDBOX_PATH.page}`);
  await new Promise((resolve, reject) => {
    iframe.addEventListener("load", resolve, { once: true });
    iframe.addEventListener("error", reject, { once: true });
    document.body.append(iframe);
  });
  const channel = new MessageChannel();
  const port = channel.port1;
  const ready = await new Promise<CodeSandboxReady | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), FRAME_READY_TIMEOUT_MS);
    port.onmessage = (event: MessageEvent<CodeSandboxReady>) => {
      if (event.data?.type !== CODE_SANDBOX_MESSAGE.ready) return;
      clearTimeout(timer);
      resolve(event.data);
    };
    iframe.contentWindow?.postMessage(init, "*", [channel.port2]);
  });
  if (!ready?.isolated || ready.error) {
    iframe.remove();
    port.close();
    if (ready?.isolated)
      throw new Error(`The code sandbox could not start: ${ready.error}`);
    return undefined;
  }
  const pending = new Map<string, (result: CodeRunResult) => void>();
  port.onmessage = (event: MessageEvent<CodeSandboxResult>) => {
    if (event.data?.type !== CODE_SANDBOX_MESSAGE.result) return;
    pending.get(event.data.id)?.({
      ...event.data.result,
      isolation: CODE_ISOLATION.sandboxPage,
    });
  };
  return {
    run(request) {
      return new Promise((resolve) => {
        const timer = setTimeout(
          () =>
            finish(
              stoppedResult(
                CODE_RUN_STOP.killed,
                "The code sandbox did not answer.",
              ),
            ),
          request.timeoutMs +
            CODE_RUN_LIMITS.watchdogGraceMs +
            FRAME_REPLY_GRACE_MS,
        );
        function finish(result: CodeRunResult) {
          clearTimeout(timer);
          pending.delete(request.id);
          resolve(result);
        }
        pending.set(request.id, finish);
        port.postMessage({ type: CODE_SANDBOX_MESSAGE.run, request });
      });
    },
    cancel(id) {
      port.postMessage({ type: CODE_SANDBOX_MESSAGE.cancel, id });
    },
  };
}
