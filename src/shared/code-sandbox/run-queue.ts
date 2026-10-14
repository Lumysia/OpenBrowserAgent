import {
  CODE_RUN_STOP,
  stoppedResult,
  type CodeRunRequest,
  type CodeRunResult,
} from "./protocol";

export type CodeRunner = {
  run(request: CodeRunRequest): Promise<CodeRunResult>;
  cancel(id: string): void;
};

// At most `max` runs at once; the others wait in order and their deadline
// starts when they leave the queue. Run ids must be unique among the runs
// queued or running.
export function createRunQueue(max: number, runner: CodeRunner): CodeRunner {
  const running = new Set<string>();
  const waiting: Array<{ id: string; start: () => void; drop: () => void }> =
    [];
  const next = () => {
    while (running.size < max && waiting.length) waiting.shift()?.start();
  };
  return {
    run(request) {
      if (
        running.has(request.id) ||
        waiting.some((item) => item.id === request.id)
      )
        return Promise.reject(
          new Error(`A code run with id ${request.id} is already going.`),
        );
      return new Promise((resolve, reject) => {
        const start = () => {
          running.add(request.id);
          runner
            .run(request)
            .then(resolve, reject)
            .finally(() => {
              running.delete(request.id);
              next();
            });
        };
        const drop = () =>
          resolve(
            stoppedResult(CODE_RUN_STOP.canceled, "The run was stopped."),
          );
        waiting.push({ id: request.id, start, drop });
        next();
      });
    },
    cancel(id) {
      const index = waiting.findIndex((item) => item.id === id);
      if (index < 0) return runner.cancel(id);
      waiting.splice(index, 1)[0].drop();
    },
  };
}
