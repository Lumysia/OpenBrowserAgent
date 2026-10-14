import { PAGE_TRANSLATE_ERROR } from "../../shared/page-translate/protocol";
import type { PageTranslateEngine } from "../../shared/page-translate/settings";
import { pauseEngine, withEngineSlot } from "./engine-gate";
import {
  EngineError,
  type EngineRequest,
  type TranslationEngine,
} from "./engines/types";

// Rate-limit pauses up to this long are waited out; longer ones are reported.
const MAX_WAIT_MS = 30_000;
const RATE_LIMIT_RETRIES = 1;
// Network errors in a row before an engine counts as failing.
const NETWORK_FAILURES = 2;

export type ActiveEngine = {
  kind: PageTranslateEngine;
  engine: TranslationEngine;
};

export type EngineFallback = {
  kind: PageTranslateEngine;
  resolve: () => Promise<TranslationEngine> | TranslationEngine;
};

// What to do after a failed request.
type Decision =
  // Try again with `chain.current` (the same engine, or the fallback).
  | "retry"
  // The fallback failed too.
  | "exhausted"
  // No fallback: the engine's own handling applies.
  | "none";

// The engine a page session translates with. An engine with a fallback
// (PAGE_TRANSLATE_FALLBACK) that fails (rate limits, refusals, errors,
// repeated network errors, unavailable here) hands over to it once, for the
// rest of the session.
export type EngineChain = ReturnType<typeof createEngineChain>;

export function createEngineChain(
  primary: ActiveEngine,
  options: {
    // The other engine to hand over to, if any.
    fallback?: EngineFallback;
    // The session already handed over to `primary` (the page reconnected
    // after a switch): another failure ends the session.
    switched?: boolean;
    // `from` failed with `error`; `to` translates from now on.
    onSwitch?: (
      from: ActiveEngine,
      to: ActiveEngine,
      error: EngineError,
    ) => void;
  } = {},
) {
  let current = primary;
  let fallback = options.fallback;
  const chained = !!fallback || !!options.switched;
  // While switching, other failures wait for the new engine.
  let switching: Promise<void> | undefined;
  // Network errors in a row, per engine.
  const networkFailures = new Map<TranslationEngine, number>();

  async function switchEngine(from: ActiveEngine, error: EngineError) {
    const next = fallback!;
    fallback = undefined;
    current = { kind: next.kind, engine: await next.resolve() };
    options.onSwitch?.(from, current, error);
  }

  return {
    get current() {
      return current;
    },
    succeeded(active: ActiveEngine) {
      networkFailures.delete(active.engine);
    },
    async failed(active: ActiveEngine, error: EngineError): Promise<Decision> {
      if (switching) await switching;
      // Another batch already switched away from this engine.
      if (active !== current) return "retry";
      if (!chained) return "none";
      if (error.kind === PAGE_TRANSLATE_ERROR.network) {
        const count = (networkFailures.get(active.engine) ?? 0) + 1;
        networkFailures.set(active.engine, count);
        if (count < NETWORK_FAILURES) return "retry";
      }
      if (!fallback) return "exhausted";
      // A fallback that can't be set up (no AI model) keeps failing with its
      // own error, for this batch and the later ones.
      switching = switchEngine(active, error).then(() => {
        switching = undefined;
      });
      await switching;
      return "retry";
    },
  };
}

export type TranslateRequest = Omit<EngineRequest, "items" | "onItem"> & {
  // A finished item and the engine that translated it.
  onItem: (id: number, text: string, engine: TranslationEngine) => void;
};

// Translates `items` with the chain's current engine: waits out short rate
// limits, splits oversized requests, and switches to the fallback engine
// when the current one fails.
export async function translateItems(
  chain: EngineChain,
  items: EngineRequest["items"],
  request: TranslateRequest,
  attempt = 0,
): Promise<void> {
  const active = chain.current;
  const { engine } = active;
  try {
    await withEngineSlot(
      engine.id,
      engine.limits.concurrency,
      request.signal,
      () =>
        engine.translate({
          ...request,
          items,
          onItem: (id, text) => request.onItem(id, text, engine),
        }),
    );
    chain.succeeded(active);
  } catch (error) {
    if (request.signal.aborted || !(error instanceof EngineError)) throw error;
    // Too much text in one request: halves.
    if (error.tooLarge && items.length > 1) {
      const half = Math.ceil(items.length / 2);
      await translateItems(chain, items.slice(0, half), request, attempt);
      await translateItems(chain, items.slice(half), request, attempt);
      return;
    }
    const decision = await chain.failed(active, error);
    if (decision === "retry")
      return translateItems(chain, items, request, attempt);
    if (decision === "exhausted")
      throw new EngineError(PAGE_TRANSLATE_ERROR.allFailed, error.message);
    if (error.kind === PAGE_TRANSLATE_ERROR.rateLimited) {
      const pause = pauseEngine(engine.id, error.retryAfterMs);
      if (pause > MAX_WAIT_MS || attempt >= RATE_LIMIT_RETRIES) throw error;
      return translateItems(chain, items, request, attempt + 1);
    }
    throw error;
  }
}
