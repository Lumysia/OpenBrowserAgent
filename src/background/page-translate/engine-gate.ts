// Per-engine limits shared by every tab: how many requests run at once, and a
// pause after the service says it is rate-limiting (honouring Retry-After,
// else backing off from 2 s up to a minute).

type Gate = {
  active: number;
  waiting: Array<() => void>;
  // No request starts before this time.
  pausedUntil: number;
  backoffMs: number;
};

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

const gates = new Map<string, Gate>();

function gate(id: string) {
  let value = gates.get(id);
  if (!value) {
    value = { active: 0, waiting: [], pausedUntil: 0, backoffMs: 0 };
    gates.set(id, value);
  }
  return value;
}

export async function withEngineSlot<T>(
  id: string,
  limit: number,
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  const current = gate(id);
  while (current.active >= limit)
    await new Promise<void>((resolve) => current.waiting.push(resolve));
  current.active++;
  try {
    const wait = current.pausedUntil - Date.now();
    if (wait > 0) await sleep(wait, signal);
    signal.throwIfAborted();
    const result = await run();
    current.backoffMs = 0;
    return result;
  } finally {
    current.active--;
    current.waiting.shift()?.();
  }
}

// Pauses the engine after a rate limit; returns how long.
export function pauseEngine(id: string, retryAfterMs?: number) {
  const current = gate(id);
  current.backoffMs = Math.min(
    MAX_BACKOFF_MS,
    Math.max(MIN_BACKOFF_MS, current.backoffMs * 2),
  );
  const pause = Math.min(MAX_BACKOFF_MS, retryAfterMs ?? current.backoffMs);
  current.pausedUntil = Math.max(current.pausedUntil, Date.now() + pause);
  return pause;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", aborted, { once: true });
  });
}
