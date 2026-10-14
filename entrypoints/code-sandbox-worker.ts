import ng from "@jitl/quickjs-ng-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
} from "quickjs-emscripten-core";
import { errorMessage } from "../src/shared/error-message";
import { runJavaScript } from "../src/shared/code-sandbox/engine";
import {
  CODE_RUN_STOP,
  CODE_SANDBOX_MESSAGE,
  stoppedResult,
  type CodeWorkerRun,
} from "../src/shared/code-sandbox/protocol";

// The Worker that runs one request in QuickJS and posts the result. It has
// no extension APIs; inside the sandbox page it has no network either.
export default defineUnlistedScript(() => {
  const scope = self as unknown as Pick<Worker, "postMessage" | "onmessage">;
  scope.onmessage = async (event: MessageEvent<CodeWorkerRun>) => {
    const { type, module, request } = event.data || {};
    if (type !== CODE_SANDBOX_MESSAGE.run) return;
    try {
      const quickjs = await newQuickJSWASMModuleFromVariant(
        newVariant(ng, { wasmModule: module }),
      );
      scope.postMessage(runJavaScript(quickjs, request));
    } catch (error) {
      scope.postMessage(
        stoppedResult(
          CODE_RUN_STOP.killed,
          `The sandbox could not start: ${errorMessage(error)}`,
        ),
      );
    }
  };
});
