import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { errorMessage } from "../src/shared/error-message";
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
// port. Only the embedding extension page can talk to it: the init message
// must come from the parent window and from the extension's origin (the
// page's own origin is opaque, but its URL keeps the extension's).
export default defineUnlistedScript({
  // Browsers without sandboxed pages (Safari) do not ship the page.
  exclude: ["safari"],
  main() {
    window.addEventListener("message", function init(event) {
      const data = event.data as Partial<CodeSandboxInit> | undefined;
      const port = event.ports[0];
      if (
        event.source !== window.parent ||
        event.origin !== `${location.protocol}//${location.host}` ||
        data?.type !== CODE_SANDBOX_MESSAGE.init ||
        !port
      )
        return;
      window.removeEventListener("message", init);
      start(data as CodeSandboxInit, port).catch((error) => {
        const ready: CodeSandboxReady = {
          type: CODE_SANDBOX_MESSAGE.ready,
          isolated: self.origin === "null",
          error: errorMessage(error),
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
