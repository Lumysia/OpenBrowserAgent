// One page's translation: finds its paragraphs, translates those on and near
// the screen first, shows each translation as it arrives, and takes it all
// away again for "Show original".
import {
  PAGE_TRANSLATE_ERROR,
  PAGE_TRANSLATE_PORT,
  type PageTranslateEvent,
  type PageTranslateRequest,
  type PageTranslateSessionConfig,
} from "../shared/page-translate/protocol";
import {
  PAGE_TRANSLATE_DISPLAY,
  type PageTranslateDisplay,
} from "../shared/page-translate/settings";
import { getBrowserApi } from "../shared/browser-api";
import { createQueue, PRIORITY } from "./queue";
import {
  removeAll,
  removeMirror,
  removeTranslation,
  setTranslationOnly,
  showMirror,
  showPartial,
  showPending,
  showTranslation,
} from "./render";
import { hideToast, showToast } from "./toast";
import { createUnits, type Unit } from "./units";

// Viewport plus one screen above and two below.
const NEAR_MARGIN = "100% 0px 200% 0px";
// Pages with less text than this are translated all at once.
const SMALL_PAGE_CHARS = 5_000;
// Translations kept for this page's session, by source text, so content the
// page shows again (virtual lists, re-renders) is translated at once.
const MEMORY_ENTRIES = 2_000;
// A note for the same problem shows at most this often.
const TOAST_INTERVAL_MS = 10_000;

const memory = new Map<string, string>();

function remember(text: string, translation: string) {
  memory.delete(text);
  memory.set(text, translation);
  if (memory.size > MEMORY_ENTRIES)
    memory.delete(memory.keys().next().value as string);
}

export function createController(onState: (translated: boolean) => void) {
  let session: ReturnType<typeof startSession> | undefined;
  return {
    get active() {
      return !!session;
    },
    toggle() {
      if (session) this.stop();
      else this.start();
    },
    start() {
      if (session) return;
      session = startSession(() => this.stop());
      onState(true);
    },
    stop() {
      if (!session) return;
      session.stop();
      session = undefined;
      onState(false);
    },
  };
}

function startSession(onFatal: () => void) {
  const queue = createQueue();
  // Units sent and waiting for a translation, by source text: identical
  // paragraphs are sent once.
  const sent = new Map<string, Set<Unit>>();
  // Each batch's source texts by item id.
  const batches = new Map<number, Map<number, string>>();
  let config: PageTranslateSessionConfig | undefined;
  let port: chrome.runtime.Port | undefined;
  let nextBatch = 1;
  let first = true;
  let halted = false;
  let smallPage = false;
  let translationOnly = false;
  let flushTimer: number | undefined;
  const toasts = new Map<string, number>();
  const targets = new Map<Element, Set<Unit>>();

  const language = () => config?.targetLanguage || "en";

  const units = createUnits({
    added(unit) {
      let set = targets.get(unit.target);
      // A watched element reports no change for a new paragraph in it: the
      // paragraph is where the others are.
      const sibling = set?.values().next().value;
      if (sibling) {
        unit.near = sibling.near;
        unit.visible = sibling.visible;
      }
      if (!set) {
        set = new Set();
        targets.set(unit.target, set);
        near.observe(unit.target);
        visible.observe(unit.target);
      }
      set.add(unit);
      if (smallPage || unit.near) {
        enqueue(unit);
        scheduleFlush();
      }
    },
    removed(unit) {
      queue.delete(unit.id);
      sent.get(unit.paragraph.source.text)?.delete(unit);
      clear(unit);
      const set = targets.get(unit.target);
      set?.delete(unit);
      if (set && !set.size) {
        targets.delete(unit.target);
        near.unobserve(unit.target);
        visible.unobserve(unit.target);
      }
    },
  });

  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        for (const unit of targets.get(entry.target) || []) {
          unit.near = entry.isIntersecting;
          if (unit.near || smallPage) enqueue(unit);
          else if (unit.state === "queued") {
            // Out of reach before its turn: wait until it comes back.
            queue.delete(unit.id);
            unit.state = "idle";
          }
        }
      scheduleFlush();
    },
    { rootMargin: NEAR_MARGIN },
  );
  const visible = new IntersectionObserver((entries) => {
    for (const entry of entries)
      for (const unit of targets.get(entry.target) || []) {
        unit.visible = entry.isIntersecting;
        if (unit.state === "queued") enqueue(unit);
      }
    scheduleFlush();
  });

  // Translations from this page's earlier sessions, for the same engine
  // and language.
  const memoryKey = (text: string) =>
    config && `${config.engine}|${config.targetLanguage}|${text}`;

  function enqueue(unit: Unit) {
    if (unit.state !== "idle" && unit.state !== "queued") return;
    const text = unit.paragraph.source.text;
    const key = memoryKey(text);
    const known = key && memory.get(key);
    if (known) {
      queue.delete(unit.id);
      show(unit, known);
      return;
    }
    unit.state = "queued";
    queue.set({
      id: unit.id,
      text,
      priority: unit.visible ? PRIORITY.visible : PRIORITY.near,
    });
  }

  function scheduleFlush() {
    if (flushTimer !== undefined) return;
    // Lets the observers report everything that changed in this frame.
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, 16);
  }

  function flush() {
    if (halted) return;
    if (!port) connect();
    // Batches wait for the session's limits.
    if (!config) return;
    while (batches.size < config.limits.concurrency && queue.size) {
      const items = queue.take(config.limits, first);
      first = false;
      const texts = new Map<number, string>();
      const request: Array<{ id: number; text: string }> = [];
      for (const item of items) {
        const unit = units.units.get(item.id);
        if (!unit) continue;
        unit.state = "sent";
        if (unit.visible)
          unit.element = showPending(unit.paragraph, language(), unit.element);
        const waiting = sent.get(item.text);
        if (waiting) {
          waiting.add(unit);
          continue;
        }
        sent.set(item.text, new Set([unit]));
        texts.set(unit.id, item.text);
        request.push({ id: unit.id, text: item.text });
      }
      if (!request.length) continue;
      const batch = nextBatch++;
      batches.set(batch, texts);
      post({ type: "translate", batch, items: request });
    }
  }

  function show(unit: Unit, translation: string) {
    unit.state = "done";
    const same =
      translation.replace(/\s+/g, " ").trim() === unit.paragraph.source.text;
    if (same) {
      clear(unit);
      return;
    }
    unit.translation = translation;
    unit.element = showTranslation(
      unit.paragraph,
      language(),
      translation,
      unit.element,
    );
    showDisplay(unit);
  }

  // Translation-only display adds a translated copy of the block.
  function showDisplay(unit: Unit) {
    if (unit.translation !== undefined && translationOnly)
      unit.mirror = showMirror(
        unit.paragraph,
        language(),
        unit.translation,
        unit.mirror,
      );
    else {
      removeMirror(unit.paragraph, unit.mirror);
      unit.mirror = undefined;
    }
  }

  function setDisplay(display: PageTranslateDisplay) {
    translationOnly = display === PAGE_TRANSLATE_DISPLAY.translation;
    setTranslationOnly(document, translationOnly);
    for (const unit of units.units.values()) showDisplay(unit);
  }

  function clear(unit: Unit) {
    removeTranslation(unit.paragraph, unit.element);
    removeMirror(unit.paragraph, unit.mirror);
    unit.element = unit.mirror = unit.translation = undefined;
  }

  function handle(event: PageTranslateEvent) {
    switch (event.type) {
      case "session":
        config = event.config;
        setDisplay(config.display);
        // Waiting paragraphs translated before show at once.
        for (const unit of units.units.values())
          if (unit.state === "queued") enqueue(unit);
        flush();
        return;
      case "display":
        setDisplay(event.display);
        return;
      case "partial": {
        const unit = units.units.get(event.id);
        if (unit?.state === "sent" && (unit.visible || unit.element))
          unit.element = showPartial(
            unit.paragraph,
            language(),
            event.text,
            unit.element,
          );
        return;
      }
      case "item": {
        const text = batches.get(event.batch)?.get(event.id);
        const key = text !== undefined && memoryKey(text);
        if (text === undefined || !key) return;
        remember(key, event.text);
        for (const unit of sent.get(text) || []) show(unit, event.text);
        sent.delete(text);
        return;
      }
      case "done":
        finishBatch(event.batch);
        scheduleFlush();
        return;
      case "error":
        // The session couldn't start: the page goes back to its original,
        // with the note on it.
        if (event.batch === undefined) onFatal();
        else if (
          event.kind === PAGE_TRANSLATE_ERROR.refused ||
          event.kind === PAGE_TRANSLATE_ERROR.unavailable ||
          event.kind === PAGE_TRANSLATE_ERROR.rateLimited
        )
          halted = true;
        toast(event.kind, event.message, event.theme);
        return;
    }
  }

  // Paragraphs the batch didn't translate failed; their spinners and
  // unfinished text go.
  function finishBatch(batch: number) {
    for (const text of batches.get(batch)?.values() || []) {
      for (const unit of sent.get(text) || []) {
        unit.state = "failed";
        clear(unit);
      }
      sent.delete(text);
    }
    batches.delete(batch);
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

  // The port closes when the background restarts or the page goes into the
  // back/forward cache; the next request opens a new one.
  function connect() {
    port = getBrowserApi().runtime.connect({ name: PAGE_TRANSLATE_PORT });
    port.onMessage.addListener(handle);
    port.onDisconnect.addListener(() => {
      port = undefined;
      config = undefined;
      for (const batch of [...batches.keys()]) {
        for (const text of batches.get(batch)?.values() || [])
          for (const unit of sent.get(text) || []) unit.state = "idle";
        finishBatchQuietly(batch);
      }
      // Paragraphs still on or near the screen are asked for again.
      for (const unit of units.units.values())
        if (unit.state === "idle" && (unit.near || smallPage)) enqueue(unit);
      if (queue.size) scheduleFlush();
    });
    port.postMessage(startRequest());
  }

  function finishBatchQuietly(batch: number) {
    for (const text of batches.get(batch)?.values() || []) sent.delete(text);
    batches.delete(batch);
  }

  const startRequest = (): PageTranslateRequest => ({
    type: "start",
    pageLanguage: document.documentElement.lang || undefined,
    title: document.title,
  });

  connect();
  const root = document.body || document.documentElement;
  void units.start(root).then(() => {
    const total = [...units.units.values()].reduce(
      (sum, unit) => sum + unit.paragraph.source.plain.length,
      0,
    );
    if (total >= SMALL_PAGE_CHARS) return;
    smallPage = true;
    for (const unit of units.units.values()) enqueue(unit);
    scheduleFlush();
  });

  return {
    stop() {
      for (const unit of units.units.values()) clear(unit);
      units.stop();
      near.disconnect();
      visible.disconnect();
      clearTimeout(flushTimer);
      queue.clear();
      port?.disconnect();
      port = undefined;
      hideToast();
      removeAll(document);
    },
  };
}
