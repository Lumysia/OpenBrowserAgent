import { getBrowserApi } from "../browser-api";
import { CODE_RUN_LIMITS } from "../config";
import { CODE_SANDBOX_PATH } from "./paths";
import {
  CODE_ISOLATION,
  CODE_RUN_STOP,
  CODE_SANDBOX_MESSAGE,
  stoppedResult,
  type CodeRunResult,
  type CodeSandboxInit,
  type CodeSandboxReady,
  type CodeSandboxResult,
} from "./protocol";
import type { CodeRunner } from "./run-queue";

const DEAD_FRAME =
  "The code sandbox page stopped answering; it starts again for the next run.";

// Loads the sandboxed page in a hidden iframe and runs code through it. The
// load and the page's ready message share one timeout; a page that does not
// start is an error. Undefined: the page started without an opaque origin
// (the browser does not apply `sandbox.pages`). A page that stops answering
// a run is removed and `onDead` is called, so the host builds a new one.
export async function startFrame(
  init: CodeSandboxInit,
  onDead: () => void,
): Promise<CodeRunner | undefined> {
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  const channel = new MessageChannel();
  const port = channel.port1;
  const close = () => {
    iframe.remove();
    port.close();
  };
  let ready: CodeSandboxReady;
  try {
    ready = await new Promise<CodeSandboxReady>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `the page did not start within ${CODE_RUN_LIMITS.frameReadyTimeoutMs} ms`,
            ),
          ),
        CODE_RUN_LIMITS.frameReadyTimeoutMs,
      );
      port.onmessage = (event: MessageEvent<CodeSandboxReady>) => {
        if (event.data?.type !== CODE_SANDBOX_MESSAGE.ready) return;
        clearTimeout(timer);
        resolve(event.data);
      };
      iframe.addEventListener(
        "load",
        () =>
          // The page's origin is opaque, so no target origin can name it;
          // everything after this message goes over the private port.
          iframe.contentWindow?.postMessage(init, "*", [channel.port2]),
        { once: true },
      );
      iframe.src = getBrowserApi().runtime.getURL(`/${CODE_SANDBOX_PATH.page}`);
      document.body.append(iframe);
    });
  } catch (error) {
    close();
    throw error;
  }
  if (!ready.isolated) {
    close();
    return undefined;
  }
  if (ready.error) {
    close();
    throw new Error(ready.error);
  }

  const pending = new Map<string, (result: CodeRunResult) => void>();
  let dead = false;
  const die = () => {
    if (dead) return;
    dead = true;
    close();
    onDead();
    for (const finish of [...pending.values()])
      finish(stoppedResult(CODE_RUN_STOP.killed, DEAD_FRAME));
  };
  port.onmessage = (event: MessageEvent<CodeSandboxResult>) => {
    if (event.data?.type !== CODE_SANDBOX_MESSAGE.result) return;
    pending.get(event.data.id)?.({
      ...event.data.result,
      isolation: CODE_ISOLATION.sandboxPage,
    });
  };
  return {
    run(request) {
      if (dead)
        return Promise.resolve(stoppedResult(CODE_RUN_STOP.killed, DEAD_FRAME));
      return new Promise((resolve) => {
        // The page's own watchdog ends every run before this fires; when it
        // does, the page (or its renderer) is gone.
        const timer = setTimeout(
          die,
          request.timeoutMs +
            CODE_RUN_LIMITS.watchdogGraceMs +
            CODE_RUN_LIMITS.frameReplyGraceMs,
        );
        pending.set(request.id, (result) => {
          clearTimeout(timer);
          pending.delete(request.id);
          resolve(result);
        });
        port.postMessage({ type: CODE_SANDBOX_MESSAGE.run, request });
      });
    },
    cancel(id) {
      if (!dead) port.postMessage({ type: CODE_SANDBOX_MESSAGE.cancel, id });
    },
  };
}
