import {
  pruneTranslations,
  readTranslations,
  translationCacheKey,
  writeTranslations,
} from "../../shared/page-translate/cache";
import { getPageTranslateMessages } from "../../shared/page-translate/messages";
import {
  PAGE_TRANSLATE_ERROR,
  type PageTranslateEvent,
  type PageTranslateItem,
  type PageTranslateRequest,
} from "../../shared/page-translate/protocol";
import {
  normalizePageTranslateSettings,
  pageTranslateTarget,
  PAGE_TRANSLATE_ENGINE,
  type PageTranslateEngine,
} from "../../shared/page-translate/settings";
import { storage } from "../../shared/storage";
import type { PageToastTheme } from "../../shared/page-toast";
import { pageToastTheme } from "../page-toast";
import { pauseEngine, withEngineSlot } from "./engine-gate";
import { EngineError, resolveEngine, type TranslationEngine } from "./engines";

// Rate-limit pauses up to this long are waited out; longer ones are reported.
const MAX_WAIT_MS = 30_000;
const RATE_LIMIT_RETRIES = 1;

type Post = (event: PageTranslateEvent) => void;

// For failures outside a session; sessions use the extension's theme.
const DEFAULT_TOAST_THEME = pageToastTheme(undefined, undefined);

type Session = {
  engine: TranslationEngine;
  engineKind: PageTranslateEngine;
  engineName: string;
  target: string;
  language: string;
  theme: PageToastTheme;
  pageLanguage?: string;
  pageTitle?: string;
};

let pruned = false;

// One page's translation: its engine and target language are fixed when it
// starts; batches run as the page asks for them.
export function createPageSession(post: Post, signal: AbortSignal) {
  let session: Promise<Session> | undefined;
  return (request: PageTranslateRequest) => {
    if (request.type === "start") {
      session = startSession(request, post);
      session.catch(() => undefined);
      return;
    }
    if (request.type !== "translate" || !session) return;
    const batch = request.batch;
    session
      .then(
        (current) => runBatch(current, request.items, batch, post, signal),
        // The session's own error was reported when it started.
        () => undefined,
      )
      .catch((error) => {
        if (!signal.aborted)
          post({
            type: "error",
            batch,
            kind: PAGE_TRANSLATE_ERROR.failed,
            message: error instanceof Error ? error.message : String(error),
            theme: DEFAULT_TOAST_THEME,
          });
      })
      .finally(() => {
        if (!signal.aborted) post({ type: "done", batch });
      });
  };
}

async function startSession(
  request: Extract<PageTranslateRequest, { type: "start" }>,
  post: Post,
): Promise<Session> {
  const [preferences, language] = await Promise.all([
    storage.preferences.get(),
    storage.language.get(),
  ]);
  const settings = normalizePageTranslateSettings(preferences.pageTranslate);
  const messages = getPageTranslateMessages(language);
  const engineName = messages.engines[settings.engine];
  const target = pageTranslateTarget(settings, language);
  const theme = pageToastTheme(
    preferences.colorScheme,
    preferences.accentColor,
  );
  try {
    const engine = await resolveEngine(settings);
    post({
      type: "session",
      config: {
        engine: settings.engine,
        targetLanguage: target,
        display: settings.display,
        limits: engine.limits,
      },
    });
    if (!pruned) {
      pruned = true;
      void pruneTranslations().catch(() => undefined);
    }
    return {
      engine,
      engineKind: settings.engine,
      engineName,
      target,
      language,
      theme,
      pageLanguage: request.pageLanguage,
      pageTitle: request.title,
    };
  } catch (error) {
    post(
      errorEvent(error, undefined, {
        engineName,
        language,
        target,
        engine: settings.engine,
        theme,
      }),
    );
    throw error;
  }
}

async function runBatch(
  session: Session,
  items: PageTranslateItem[],
  batch: number,
  post: Post,
  signal: AbortSignal,
) {
  const { engine, target } = session;
  const keys = new Map<number, string>();
  await Promise.all(
    items.map(async (item) =>
      keys.set(
        item.id,
        await translationCacheKey(engine.cacheKey, target, item.text),
      ),
    ),
  );
  const cached = await readTranslations([...keys.values()]).catch(
    () => new Map<string, string>(),
  );
  const pending: PageTranslateItem[] = [];
  for (const item of items) {
    const text = cached.get(keys.get(item.id)!);
    if (text === undefined) pending.push(item);
    else post({ type: "item", batch, id: item.id, text });
  }
  if (!pending.length) return;
  const fresh = new Map<string, string>();
  const delivered = new Set<number>();
  const deliver = (id: number, text: string) => {
    if (signal.aborted || delivered.has(id) || !text) return;
    delivered.add(id);
    fresh.set(keys.get(id)!, text);
    post({ type: "item", batch, id, text });
  };
  const run = (batchItems: PageTranslateItem[]) =>
    translateItems(session, batchItems, signal, deliver, (id, text) =>
      post({ type: "partial", batch, id, text }),
    );
  try {
    await run(pending);
    // Items a model left out get one more try, on their own.
    const missing = pending.filter((item) => !delivered.has(item.id));
    if (missing.length && missing.length < pending.length && !signal.aborted)
      await run(missing);
  } catch (error) {
    if (signal.aborted) return;
    post(
      errorEvent(error, batch, {
        engineName: session.engineName,
        language: session.language,
        target,
        engine: session.engineKind,
        theme: session.theme,
      }),
    );
  } finally {
    await writeTranslations(fresh).catch(() => undefined);
  }
}

async function translateItems(
  session: Session,
  items: PageTranslateItem[],
  signal: AbortSignal,
  onItem: (id: number, text: string) => void,
  onPartial: (id: number, text: string) => void,
  attempt = 0,
): Promise<void> {
  const { engine } = session;
  try {
    await withEngineSlot(engine.id, engine.limits.concurrency, signal, () =>
      engine.translate({
        items,
        target: session.target,
        pageLanguage: session.pageLanguage,
        pageTitle: session.pageTitle,
        signal,
        onItem,
        onPartial,
      }),
    );
  } catch (error) {
    if (signal.aborted || !(error instanceof EngineError)) throw error;
    if (error.kind === PAGE_TRANSLATE_ERROR.rateLimited) {
      const pause = pauseEngine(engine.id, error.retryAfterMs);
      if (pause > MAX_WAIT_MS || attempt >= RATE_LIMIT_RETRIES) throw error;
      return translateItems(
        session,
        items,
        signal,
        onItem,
        onPartial,
        attempt + 1,
      );
    }
    // Too much text in one request: halves.
    if (error.tooLarge && items.length > 1) {
      const half = Math.ceil(items.length / 2);
      await translateItems(
        session,
        items.slice(0, half),
        signal,
        onItem,
        onPartial,
        attempt,
      );
      await translateItems(
        session,
        items.slice(half),
        signal,
        onItem,
        onPartial,
        attempt,
      );
      return;
    }
    throw error;
  }
}

function errorEvent(
  error: unknown,
  batch: number | undefined,
  context: {
    engineName: string;
    language: string;
    target: string;
    engine: PageTranslateEngine;
    theme: PageToastTheme;
  },
): PageTranslateEvent {
  const kind =
    error instanceof EngineError ? error.kind : PAGE_TRANSLATE_ERROR.failed;
  const messages = getPageTranslateMessages(context.language);
  let message = messages.errors[kind].replaceAll(
    "{engine}",
    context.engineName,
  );
  if (kind === PAGE_TRANSLATE_ERROR.unavailable)
    if (context.engine === PAGE_TRANSLATE_ENGINE.model)
      message = messages.noModel;
    else if (context.engine === PAGE_TRANSLATE_ENGINE.browser)
      message = messages.browserUnsupported.replaceAll(
        "{language}",
        displayName(context.target, context.language),
      );
  return { type: "error", batch, kind, message, theme: context.theme };
}

function displayName(tag: string, language: string) {
  try {
    return (
      new Intl.DisplayNames([language || "en"], { type: "language" }).of(tag) ||
      tag
    );
  } catch {
    return tag;
  }
}
