import { QUICK_TASK_CONCURRENCY } from "../shared/config";
import { isLocalEndpoint } from "../shared/provider-consent";
import { providerType } from "../shared/providers";
import { baseUrlKey } from "../shared/provider-urls";
import { QUICK_TASK_REASONING } from "../shared/reasoning";
import {
  requestText,
  type ProviderModel,
  type TextRequestOptions,
} from "./pi-provider";

// Quick tasks are short requests a person waits for: smart bar actions and
// page translation batches. They ask for the least thinking (see
// request-thinking.ts) and share one queue per endpoint, where a smart bar
// request goes before the page translation batches still waiting.

export const QUICK_TASK_PRIORITY = {
  // Someone waits for this answer now (the smart bar).
  interactive: "interactive",
  // Work that can wait for it (page translation batches).
  background: "background",
} as const;

type QuickTaskPriority =
  (typeof QUICK_TASK_PRIORITY)[keyof typeof QUICK_TASK_PRIORITY];

// Page translation batches at once on an endpoint. Servers on this device or
// the local network usually run one request at a time, so parallel batches
// would only queue there and delay the first translations.
export function quickTaskConcurrency(
  model: Pick<ProviderModel, "provider" | "baseUrl">,
) {
  if (isLocalEndpoint(model.baseUrl)) return 1;
  return (
    providerType(model.provider).quickTaskConcurrency ?? QUICK_TASK_CONCURRENCY
  );
}

type Queue = { active: number; waiting: Array<() => void> };

const queues = new Map<string, Queue>();

// Runs `run` in its turn on the model's endpoint. Interactive requests start
// at once; background ones wait while the endpoint is at its concurrency,
// counting the interactive requests that run.
export async function withQuickTaskTurn<T>(
  model: Pick<ProviderModel, "provider" | "baseUrl">,
  priority: QuickTaskPriority,
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const key = baseUrlKey(model.baseUrl);
  let queue = queues.get(key);
  if (!queue) queues.set(key, (queue = { active: 0, waiting: [] }));
  const limit = quickTaskConcurrency(model);
  if (
    priority === QUICK_TASK_PRIORITY.background &&
    (queue.active >= limit || queue.waiting.length)
  )
    await waitForTurn(queue, signal);
  else queue.active++;
  try {
    return await run();
  } finally {
    queue.active--;
    while (queue.waiting.length && queue.active < limit)
      queue.waiting.shift()!();
    if (!queue.active && !queue.waiting.length) queues.delete(key);
  }
}

// Resolves, holding a slot, once a finished request makes room; rejects and
// leaves the line when `signal` aborts first.
function waitForTurn(queue: Queue, signal: AbortSignal | undefined) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", abort);
      queue.active++;
      resolve();
    };
    const abort = () => {
      queue.waiting.splice(queue.waiting.indexOf(start), 1);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    queue.waiting.push(start);
  });
}

// A quick-task request: least thinking, in its turn on the endpoint.
export function requestQuickText(
  model: ProviderModel,
  request: { system?: string; prompt: string },
  priority: QuickTaskPriority,
  options: Omit<TextRequestOptions, "reasoning"> = {},
) {
  return withQuickTaskTurn(model, priority, options.signal, () =>
    requestText(model, request, {
      ...options,
      reasoning: QUICK_TASK_REASONING,
    }),
  );
}
