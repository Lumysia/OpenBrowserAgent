import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import {
  CODE_SANDBOX_MESSAGE,
  type CodeSandboxCancel,
  type CodeSandboxInit,
  type CodeSandboxReady,
  type CodeSandboxResult,
  type CodeSandboxRun,
} from "../src/shared/code-sandbox/protocol";
import { createWorkerRunner } from "../src/shared/code-sandbox/worker-runner";

// The sandboxed page: an opaque origin with no extension APIs and no
// network (see CODE_SANDBOX_CSP). The page that embeds it sends the Worker's
// source, the interpreter and a MessagePort once; runs then travel over the
// port. Only the embedding page can talk to it.
export default defineUnlistedScript({
  include: ["chrome", "firefox"],
  main() {
    window.addEventListener("message", function init(event) {
      const data = event.data as Partial<CodeSandboxInit> | undefined;
      const port = event.ports[0];
      if (
        event.source !== window.parent ||
        data?.type !== CODE_SANDBOX_MESSAGE.init ||
        !port
      )
        return;
      window.removeEventListener("message", init);
      start(data as CodeSandboxInit, port).catch((error) => {
        const ready: CodeSandboxReady = {
          type: CODE_SANDBOX_MESSAGE.ready,
          isolated: self.origin === "null",
          error: error instanceof Error ? error.message : String(error),
        };
        port.postMessage(ready);
      });
    });
  },
});

async function start(init: CodeSandboxInit, port: MessagePort) {
  const module = await WebAssembly.compile(init.wasm);
  const source = URL.createObjectURL(
    new Blob([init.workerSource], { type: "text/javascript" }),
  );
  const runner = createWorkerRunner(() => new Worker(source), module);
  port.onmessage = async (
    event: MessageEvent<CodeSandboxRun | CodeSandboxCancel>,
  ) => {
    const message = event.data;
    if (message?.type === CODE_SANDBOX_MESSAGE.cancel)
      runner.cancel(message.id);
    if (message?.type !== CODE_SANDBOX_MESSAGE.run) return;
    const reply: CodeSandboxResult = {
      type: CODE_SANDBOX_MESSAGE.result,
      id: message.request.id,
      result: await runner.run(message.request),
    };
    port.postMessage(reply);
  };
  const ready: CodeSandboxReady = {
    type: CODE_SANDBOX_MESSAGE.ready,
    isolated: self.origin === "null",
  };
  port.postMessage(ready);
}
