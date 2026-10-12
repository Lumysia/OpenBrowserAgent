// For APIs without native cancellation, stop waiting and gate subsequent work.
// The original promise remains observed; this cannot undo a dispatched operation.
export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export function delay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Gives up on `run` after `milliseconds`. Work that `run` wraps in `pause`
// (such as a request with limits of its own) does not count toward the limit.
export async function withCancellationTimeout<T>(
  run: (signal: AbortSignal, pause: Pause) => Promise<T>,
  milliseconds: number,
  message: string,
  parent?: AbortSignal,
) {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", abort, { once: true });
  let remaining = milliseconds;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    started = Date.now();
    timer = setTimeout(
      () => controller.abort(new Error(message)),
      Math.max(0, remaining),
    );
  };
  let paused = 0;
  let done = false;
  const pause: Pause = async (task) => {
    if (paused++ === 0) {
      clearTimeout(timer);
      remaining -= Date.now() - started;
    }
    try {
      return await task();
    } finally {
      if (--paused === 0 && !done && !controller.signal.aborted) start();
    }
  };
  start();
  try {
    return await abortable(run(controller.signal, pause), controller.signal);
  } finally {
    done = true;
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

export type Pause = <R>(task: () => Promise<R>) => Promise<R>;
