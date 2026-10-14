import { CODE_RUN_LIMITS } from "../config";
import {
  CODE_RUN_STOP,
  CODE_SANDBOX_MESSAGE,
  stoppedResult,
  type CodeRunResult,
  type CodeWorkerRun,
} from "./protocol";
import type { CodeRunner } from "./run-queue";

// Runs each request in a new Worker, which ends with the run: no state
// carries over, and a run that ignores its deadline is killed with
// terminate(). `module` is the compiled interpreter. The host's run queue
// limits how many run at once and keeps run ids unique.
export function createWorkerRunner(
  createWorker: () => Worker,
  module: WebAssembly.Module,
): CodeRunner {
  const running = new Map<string, (result: CodeRunResult) => void>();
  return {
    run(request) {
      return new Promise((resolve) => {
        const started = performance.now();
        const worker = createWorker();
        const elapsed = () => Math.round(performance.now() - started);
        const finish = (result: CodeRunResult) => {
          if (!running.has(request.id)) return;
          running.delete(request.id);
          clearTimeout(watchdog);
          worker.terminate();
          resolve(result);
        };
        running.set(request.id, finish);
        const watchdog = setTimeout(
          () =>
            finish(
              stoppedResult(
                CODE_RUN_STOP.killed,
                `The code did not stop at its ${request.timeoutMs} ms limit, so the sandbox was shut down.`,
                elapsed(),
              ),
            ),
          request.timeoutMs + CODE_RUN_LIMITS.watchdogGraceMs,
        );
        worker.onmessage = (event: MessageEvent<CodeRunResult>) =>
          finish(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          finish(
            stoppedResult(
              CODE_RUN_STOP.killed,
              `The sandbox failed: ${event.message || "worker error"}`,
              elapsed(),
            ),
          );
        };
        const message: CodeWorkerRun = {
          type: CODE_SANDBOX_MESSAGE.run,
          module,
          request,
        };
        worker.postMessage(message);
      });
    },
    cancel(id) {
      running.get(id)?.(
        stoppedResult(CODE_RUN_STOP.canceled, "The run was stopped."),
      );
    },
  };
}
