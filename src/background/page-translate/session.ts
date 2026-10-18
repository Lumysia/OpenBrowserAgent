import { errorMessage } from "../../shared/error-message";
import { normalizeLanguageTag } from "../../shared/language-tags";
import {
  pruneTranslations,
  readTranslations,
  translationCacheKey,
  writeTranslations,
} from "../../shared/page-translate/cache";
import {
  boundedContext,
  clipContext,
  isPageTranslateRole,
  PAGE_TRANSLATE_CONTEXT_LIMITS,
  type PageTranslateContext,
} from "../../shared/page-translate/context";
import {
  PAGE_TRANSLATE_CONTENT,
  PAGE_TRANSLATE_ERROR,
  type PageTranslateContent,
  type PageTranslateEvent,
  type PageTranslateItem,
  type PageTranslateRequest,
} from "../../shared/page-translate/protocol";
import {
  normalizePageTranslateSettings,
  translateIntoLanguage,
  PAGE_TRANSLATE_FALLBACK,
  type PageTranslateEngine,
} from "../../shared/page-translate/settings";
import { storage } from "../../shared/storage";
import type { PageToastTheme } from "../../shared/page-toast";
import { pageToastTheme } from "../page-toast";
import {
  createEngineChain,
  translateItems,
  type EngineChain,
} from "./engine-chain";
import {
  engineCacheKey,
  resolveEngine,
  type TranslationEngine,
} from "./engines";
import { errorEvent, switchMessage } from "./notes";
import { createTermMemory, type TermMemory } from "./term-memory";

type Post = (event: PageTranslateEvent) => void;

// For failures outside a session; sessions use the extension's theme.
const DEFAULT_TOAST_THEME = pageToastTheme(undefined, undefined);

type Session = {
  chain: EngineChain;
  // The engine chosen in the settings, which the chain may have left.
  selected: PageTranslateEngine;
  target: string;
  language: string;
  theme: PageToastTheme;
  // The language the page declares for the text it sends, and one that is
  // only a hint: the document's language says what a page's own text is
  // in, not what its videos say.
  pageLanguage?: string;
  languageHint?: string;
  pageTitle?: string;
  pageDescription?: string;
  content?: PageTranslateContent;
  terms: TermMemory;
};

let pruned = false;

// One page's translation: its engine and target language are fixed when it
// starts (an engine that fails hands over to its fallback once); batches run
// as the page asks for them.
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
    const items = request.items.map(({ id, text, role, language }) => {
      const declared =
        typeof language === "string" ? normalizeLanguageTag(language) : "";
      return {
        id,
        text,
        ...(isPageTranslateRole(role) && { role }),
        ...(declared && { language: declared }),
      };
    });
    const context = boundedContext(request.context);
    session
      .then(
        (current) => runBatch(current, { items, context }, batch, post, signal),
        // The session's own error was reported when it started.
        () => undefined,
      )
      .catch((error) => {
        if (!signal.aborted)
          post({
            type: "error",
            batch,
            kind: PAGE_TRANSLATE_ERROR.failed,
            message: errorMessage(error),
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
  const target = translateIntoLanguage(settings, language);
  const theme = pageToastTheme(
    preferences.colorScheme,
    preferences.accentColor,
  );
  // The page switched to the fallback engine in an earlier session.
  const switched =
    !!request.engine &&
    PAGE_TRANSLATE_FALLBACK[settings.engine] === request.engine;
  const kind = switched ? request.engine! : settings.engine;
  const fallback = switched ? undefined : PAGE_TRANSLATE_FALLBACK[kind];
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
        translateMenus: settings.translateMenus,
        limits: engine.limits,
      },
    });
    if (!pruned) {
      pruned = true;
      void pruneTranslations().catch(() => undefined);
    }
    const subtitles = request.content === PAGE_TRANSLATE_CONTENT.subtitles;
    return {
      chain,
      selected: settings.engine,
      target,
      language,
      theme,
      pageLanguage: subtitles ? undefined : request.pageLanguage,
      languageHint: subtitles ? request.pageLanguage : undefined,
      pageTitle: request.title,
      pageDescription:
        typeof request.description === "string" && request.description.trim()
          ? clipContext(
              request.description,
              PAGE_TRANSLATE_CONTEXT_LIMITS.description,
            )
          : undefined,
      content: subtitles ? request.content : undefined,
      terms: createTermMemory(),
    };
  } catch (error) {
    post(
      errorEvent(error, undefined, {
        language,
        theme,
        kind,
        selected: settings.engine,
      }),
    );
    throw error;
  }
}

async function runBatch(
  session: Session,
  {
    items,
    context,
  }: { items: PageTranslateItem[]; context?: PageTranslateContext },
  batch: number,
  post: Post,
  signal: AbortSignal,
) {
  const { chain, target, content } = session;
  const cacheKey = (engine: TranslationEngine, text: string) =>
    translationCacheKey(engineCacheKey(engine, content), target, text);
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
    else {
      session.terms.remember(item.text, text);
      post({ type: "item", batch, id: item.id, text });
    }
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
    session.terms.remember(sources.get(id)!, text);
    post({ type: "item", batch, id, text });
  };
  const run = (batchItems: PageTranslateItem[]) =>
    translateItems(chain, batchItems, {
      target,
      pageLanguage: session.pageLanguage,
      languageHint: session.languageHint,
      pageTitle: session.pageTitle,
      pageDescription: session.pageDescription,
      content,
      context,
      terms: session.terms.examples(batchItems.map((item) => item.text)),
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
        theme: session.theme,
        kind: chain.current.kind,
        selected: session.selected,
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
