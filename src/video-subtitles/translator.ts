// The frame's subtitle translation session with the background: the same
// port, engines and cache as page translation, as subtitle content. Every
// video in the frame asks it for the lines it needs next; each line's text
// is translated once.
import {
  PAGE_TRANSLATE_CONTENT,
  PAGE_TRANSLATE_ERROR,
  PAGE_TRANSLATE_PORT,
  type PageTranslateEvent,
  type PageTranslateRequest,
  type PageTranslateSessionConfig,
} from "../shared/page-translate/protocol";
import type { PageTranslateEngine } from "../shared/page-translate/settings";
import { getBrowserApi } from "../shared/browser-api";
import { createQueue } from "../page-translate/queue";
import { showToast } from "../page-translate/toast";

// Errors after which no more lines are sent.
const HALTING_ERRORS = new Set<string>([
  PAGE_TRANSLATE_ERROR.refused,
  PAGE_TRANSLATE_ERROR.unavailable,
  PAGE_TRANSLATE_ERROR.rateLimited,
  PAGE_TRANSLATE_ERROR.allFailed,
]);
// A note for the same problem shows at most this often.
const TOAST_INTERVAL_MS = 10_000;
// Translations kept, by source text, for lines that come back (seeks).
const MEMORY_ENTRIES = 5_000;

export type WantedLine = {
  text: string;
  // The lines said just before, as context for the AI model.
  before?: string;
};

type LineState =
  | { state: "queued" | "sent" | "failed" }
  | { state: "done"; translation: string };

export type SubtitleTranslator = ReturnType<typeof createTranslator>;

export function createTranslator({
  onChange,
  onFatal,
}: {
  // A line's translation (or its partial text) arrived or failed.
  onChange: () => void;
  // The session couldn't start (no engine): every video stops.
  onFatal: () => void;
}) {
  const queue = createQueue();
  const lines = new Map<string, LineState>();
  const partials = new Map<string, string>();
  const ids = new Map<string, number>();
  const texts = new Map<number, string>();
  const before = new Map<number, string>();
  // Each owner's wanted lines, nearest first.
  const wanted = new Map<object, WantedLine[]>();
  // Each batch's texts by item id.
  const batches = new Map<number, Map<number, string>>();
  const toasts = new Map<string, number>();
  let config: PageTranslateSessionConfig | undefined;
  let engine: PageTranslateEngine | undefined;
  let port: chrome.runtime.Port | undefined;
  let nextId = 1;
  let nextBatch = 1;
  let first = true;
  let halted = false;
  let stopped = false;

  const idOf = (text: string) => {
    let id = ids.get(text);
    if (id === undefined) {
      id = nextId++;
      ids.set(text, id);
      texts.set(id, text);
    }
    return id;
  };

  function settle(text: string, state: LineState) {
    lines.delete(text);
    lines.set(text, state);
    partials.delete(text);
    if (lines.size <= MEMORY_ENTRIES) return;
    for (const [key, value] of lines) {
      if (lines.size <= MEMORY_ENTRIES) break;
      if (value.state === "done" || value.state === "failed") lines.delete(key);
    }
  }

  // The queue holds every owner's wanted lines that aren't asked for yet:
  // the nearest of each first.
  function requeue() {
    queue.clear();
    for (const list of wanted.values())
      list.forEach((line, rank) => {
        const state = lines.get(line.text)?.state;
        if (state && state !== "queued") return;
        const id = idOf(line.text);
        if (line.before) before.set(id, line.before);
        lines.set(line.text, { state: "queued" });
        queue.set({ id, text: line.text, priority: rank });
      });
    // Lines no longer wanted aren't waiting anymore.
    for (const [text, value] of lines)
      if (value.state === "queued" && !queue.has(idOf(text)))
        lines.delete(text);
  }

  function flush() {
    if (halted || stopped) return;
    if (!port) connect();
    if (!config) return;
    while (batches.size < config.limits.concurrency && queue.size) {
      const items = queue.take(config.limits, first);
      first = false;
      const sent = new Map<number, string>();
      for (const item of items) {
        sent.set(item.id, item.text);
        lines.set(item.text, { state: "sent" });
      }
      const batch = nextBatch++;
      batches.set(batch, sent);
      const context = before.get(items[0]!.id);
      post({
        type: "translate",
        batch,
        items: items.map(({ id, text }) => ({ id, text })),
        ...(context && { context: { before: context } }),
      });
    }
  }

  function handle(event: PageTranslateEvent) {
    switch (event.type) {
      case "session":
        config = event.config;
        engine = config.engine;
        flush();
        return;
      case "switched":
        if (config)
          config = { ...config, engine: event.engine, limits: event.limits };
        engine = event.engine;
        toast(event.type, event.message, event.theme);
        flush();
        return;
      case "partial": {
        const text = texts.get(event.id);
        if (text === undefined || lines.get(text)?.state !== "sent") return;
        partials.set(text, event.text);
        onChange();
        return;
      }
      case "item": {
        const text = batches.get(event.batch)?.get(event.id);
        if (text === undefined) return;
        settle(text, { state: "done", translation: event.text });
        onChange();
        return;
      }
      case "done":
        endBatch(event.batch, "failed");
        flush();
        return;
      case "error":
        if (event.batch === undefined) onFatal();
        else if (HALTING_ERRORS.has(event.kind)) halted = true;
        toast(event.kind, event.message, event.theme);
        return;
      case "view":
        return;
    }
  }

  // Lines a finished batch didn't return failed; after a disconnect they
  // are asked for again.
  function endBatch(batch: number, outcome: "failed" | "retry") {
    for (const text of batches.get(batch)?.values() || []) {
      if (lines.get(text)?.state !== "sent") continue;
      if (outcome === "failed") settle(text, { state: "failed" });
      else lines.delete(text);
    }
    batches.delete(batch);
    if (outcome === "failed") onChange();
  }

  function toast(
    kind: string,
    message: string,
    theme: Parameters<typeof showToast>[1],
  ) {
    const now = Date.now();
    if (now - (toasts.get(kind) ?? -Infinity) < TOAST_INTERVAL_MS) return;
    toasts.set(kind, now);
    showToast(message, theme);
  }

  function post(request: PageTranslateRequest) {
    port?.postMessage(request);
  }

  function connect() {
    port = getBrowserApi().runtime.connect({ name: PAGE_TRANSLATE_PORT });
    port.onMessage.addListener(handle);
    port.onDisconnect.addListener(() => {
      port = undefined;
      config = undefined;
      for (const batch of [...batches.keys()]) endBatch(batch, "retry");
      requeue();
      if (queue.size) flush();
    });
    post({
      type: "start",
      content: PAGE_TRANSLATE_CONTENT.subtitles,
      pageLanguage: document.documentElement.lang || undefined,
      title: document.title,
      engine,
    });
  }

  return {
    // The language translations are in; empty until the session starts.
    get language() {
      return config?.targetLanguage ?? "";
    },
    // `owner`'s lines to translate, nearest first; replaces its last list.
    want(owner: object, list: WantedLine[]) {
      wanted.set(owner, list);
      requeue();
      flush();
    },
    forget(owner: object) {
      wanted.delete(owner);
      requeue();
    },
    // The line's translation, or the part written so far; `pending` while
    // it is on its way.
    lookup(text: string) {
      const line = lines.get(text);
      if (line?.state === "done") return { translation: line.translation };
      if (line?.state === "sent" || (line?.state === "queued" && !halted))
        return { pending: true, partial: partials.get(text) };
      return {};
    },
    stop() {
      stopped = true;
      wanted.clear();
      queue.clear();
      port?.disconnect();
      port = undefined;
    },
  };
}
