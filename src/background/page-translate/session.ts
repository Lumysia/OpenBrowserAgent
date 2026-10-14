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
  FREE_ENGINE_FALLBACK,
  normalizePageTranslateSettings,
  pageTranslateTarget,
  PAGE_TRANSLATE_ENGINE,
  type PageTranslateEngine,
} from "../../shared/page-translate/settings";
import { getMessages } from "../../shared/i18n";
import { storage } from "../../shared/storage";
import { UserError, userErrorText } from "../../shared/user-errors";
import { errorWithDetail } from "../../ui/error-text";
import type { PageToastTheme } from "../../shared/page-toast";
import { pageToastTheme } from "../page-toast";
import {
  createEngineChain,
  translateItems,
  type EngineChain,
} from "./engine-chain";
import { EngineError, resolveEngine, type TranslationEngine } from "./engines";

type Post = (event: PageTranslateEvent) => void;

// For failures outside a session; sessions use the extension's theme.
const DEFAULT_TOAST_THEME = pageToastTheme(undefined, undefined);

type Session = {
  chain: EngineChain;
  target: string;
  language: string;
  theme: PageToastTheme;
  pageLanguage?: string;
  pageTitle?: string;
};

let pruned = false;

// One page's translation: its engine and target language are fixed when it
// starts (a failing free service hands over to the other one once); batches
// run as the page asks for them.
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
  const target = pageTranslateTarget(settings, language);
  const theme = pageToastTheme(
    preferences.colorScheme,
    preferences.accentColor,
  );
  // The page switched to the other free service in an earlier session.
  const switched =
    !!request.engine &&
    FREE_ENGINE_FALLBACK[settings.engine] === request.engine;
  const kind = switched ? request.engine! : settings.engine;
  const fallback = switched ? undefined : FREE_ENGINE_FALLBACK[kind];
  try {
    const engine = await resolveEngine({ ...settings, engine: kind });
    const chain = createEngineChain(
      { kind, engine },
      {
        switched,
        fallback: fallback && {
          kind: fallback,
          resolve: () => resolveEngine({ ...settings, engine: fallback }),
        },
        onSwitch: (from, to, error) =>
          post({
            type: "switched",
            engine: to.kind,
            limits: to.engine.limits,
            message: switchMessage(language, from.kind, to.kind, error),
            theme,
          }),
      },
    );
    post({
      type: "session",
      config: {
        engine: kind,
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
      chain,
      target,
      language,
      theme,
      pageLanguage: request.pageLanguage,
      pageTitle: request.title,
    };
  } catch (error) {
    post(errorEvent(error, undefined, { language, target, theme, kind }));
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
  const { chain, target } = session;
  const cacheKey = (engine: TranslationEngine, text: string) =>
    translationCacheKey(engine.cacheKey, target, text);
  const keys = new Map<number, string>();
  const engine = chain.current.engine;
  await Promise.all(
    items.map(async (item) =>
      keys.set(item.id, await cacheKey(engine, item.text)),
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
  const sources = new Map(pending.map((item) => [item.id, item.text]));
  // Saved under the engine that translated them: a switch can happen mid-batch.
  const fresh: Array<{
    engine: TranslationEngine;
    source: string;
    text: string;
  }> = [];
  const delivered = new Set<number>();
  const deliver = (id: number, text: string, engine: TranslationEngine) => {
    if (signal.aborted || delivered.has(id) || !text) return;
    delivered.add(id);
    fresh.push({ engine, source: sources.get(id)!, text });
    post({ type: "item", batch, id, text });
  };
  const run = (batchItems: PageTranslateItem[]) =>
    translateItems(chain, batchItems, {
      target,
      pageLanguage: session.pageLanguage,
      pageTitle: session.pageTitle,
      signal,
      onItem: deliver,
      onPartial: (id, text) => post({ type: "partial", batch, id, text }),
    });
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
        language: session.language,
        target,
        theme: session.theme,
        kind: chain.current.kind,
      }),
    );
  } finally {
    await saveTranslations(fresh, cacheKey).catch(() => undefined);
  }
}

async function saveTranslations(
  fresh: Array<{ engine: TranslationEngine; source: string; text: string }>,
  cacheKey: (engine: TranslationEngine, text: string) => Promise<string>,
) {
  if (!fresh.length) return;
  const entries = await Promise.all(
    fresh.map(
      async ({ engine, source, text }) =>
        [await cacheKey(engine, source), text] as const,
    ),
  );
  await writeTranslations(new Map(entries));
}

function errorEvent(
  error: unknown,
  batch: number | undefined,
  context: {
    language: string;
    target: string;
    theme: PageToastTheme;
    // The engine in use when it failed.
    kind: PageTranslateEngine;
  },
): PageTranslateEvent {
  const kind =
    error instanceof EngineError
      ? error.kind
      : error instanceof UserError
        ? PAGE_TRANSLATE_ERROR.unavailable
        : PAGE_TRANSLATE_ERROR.failed;
  const messages = getPageTranslateMessages(context.language);
  const t = getMessages(context.language);
  let message = messages.errors[kind].replaceAll(
    "{engine}",
    messages.engines[context.kind],
  );
  if (error instanceof UserError) message = userErrorText(error, t);
  // An error from elsewhere (the provider, the browser) adds its own text.
  else if (!(error instanceof EngineError))
    message = errorWithDetail(message, error, t);
  else if (kind === PAGE_TRANSLATE_ERROR.allFailed)
    message = serviceMessage(
      messages.errors.allFailed,
      context.language,
      FREE_ENGINE_FALLBACK[context.kind] ?? context.kind,
      context.kind,
    );
  else if (
    kind === PAGE_TRANSLATE_ERROR.unavailable &&
    context.kind === PAGE_TRANSLATE_ENGINE.browser
  )
    message = messages.browserUnsupported.replaceAll(
      "{language}",
      displayName(context.target, context.language),
    );
  return { type: "error", batch, kind, message, theme: context.theme };
}

function switchMessage(
  language: string,
  from: PageTranslateEngine,
  to: PageTranslateEngine,
  error: EngineError,
) {
  const { switched } = getPageTranslateMessages(language);
  return serviceMessage(
    error.kind === PAGE_TRANSLATE_ERROR.rateLimited
      ? switched.rateLimited
      : switched.failed,
    language,
    from,
    to,
  );
}

// {engine}: the service that failed first; {fallback}: the other one.
function serviceMessage(
  template: string,
  language: string,
  engine: PageTranslateEngine,
  fallback: PageTranslateEngine,
) {
  const { freeServices } = getPageTranslateMessages(language);
  const name = (kind: PageTranslateEngine) =>
    freeServices[kind as keyof typeof freeServices] ?? kind;
  return template
    .replaceAll("{engine}", name(engine))
    .replaceAll("{fallback}", name(fallback));
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
