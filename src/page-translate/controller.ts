// One page's translation: finds its paragraphs, translates those on and near
// the screen first, shows each translation as it arrives, and takes it all
// away again for "Show original".
import {
  PAGE_TRANSLATE_ERROR,
  PAGE_TRANSLATE_PORT,
  type PageTranslateEvent,
  type PageTranslateRequest,
  type PageTranslateSessionConfig,
  type PageTranslateView,
} from "../shared/page-translate/protocol";
import {
  PAGE_TRANSLATE_DISPLAY,
  type PageTranslateEngine,
} from "../shared/page-translate/settings";
import { getBrowserApi } from "../shared/browser-api";
import { plainText } from "../shared/page-translate/placeholders";
import { compact } from "../shared/text";
import { addsLittle } from "./metadata";
import { createPresenter } from "./presenter";
import { createQueue, PRIORITY } from "./queue";
import { removeAll } from "./render";
import { hideToast, showToast } from "./toast";
import { createUnits, type Unit } from "./units";

// Viewport plus one screen above and two below.
const NEAR_MARGIN = "100% 0px 200% 0px";
// Pages with less text than this are translated all at once.
const SMALL_PAGE_CHARS = 5_000;
// Translations kept for this page's session, by source text, so content the
// page shows again (virtual lists, re-renders) is translated at once.
const MEMORY_ENTRIES = 2_000;
// How long sending waits for the observers to tell which new paragraphs are
// on screen (they report each new one once, in the next frame; a page that
// gets no frames doesn't wait longer).
const VISIBILITY_WAIT_MS = 250;
// One frame: how long sending waits for the observers' reports.
const FRAME_MS = 16;
// A note for the same problem shows at most this often.
const TOAST_INTERVAL_MS = 10_000;
// Errors after which no more paragraphs are sent.
const HALTING_ERRORS = new Set<string>([
  PAGE_TRANSLATE_ERROR.refused,
  PAGE_TRANSLATE_ERROR.unavailable,
  PAGE_TRANSLATE_ERROR.rateLimited,
  PAGE_TRANSLATE_ERROR.allFailed,
]);

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
  // The last session's engine; a session after a reconnect keeps a switch.
  let engine: PageTranslateEngine | undefined;
  let port: chrome.runtime.Port | undefined;
  let nextBatch = 1;
  let first = true;
  let halted = false;
  let smallPage = false;
  let translateMenus = false;
  let flushTimer: number | undefined;
  const toasts = new Map<string, number>();
  const targets = new Map<Element, Set<Unit>>();
  // Watched elements the visibility observer hasn't reported yet, and since
  // when sending waits for them.
  const unreported = new Set<Element>();
  let waitingSince = 0;

  // Unknown until the session's settings arrive (nothing shows before).
  const language = () => config?.targetLanguage ?? "";
  const root = document.body || document.documentElement;

  const units = createUnits(
    {
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
          unreported.add(unit.target);
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
          unreported.delete(unit.target);
          near.unobserve(unit.target);
          visible.unobserve(unit.target);
        }
      },
    },
    { translateMenus },
  );
  const presenter = createPresenter({
    language,
    units: () => units.units.values(),
    mute: units.mute,
    translateMenus: () => translateMenus,
  });

  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        for (const unit of targets.get(entry.target) || []) {
          unit.near = entry.isIntersecting;
          // A translation for a paragraph that wasn't rendered (a collapsed
          // section) shows when the paragraph does.
          if (unit.translation !== undefined && !unit.placement)
            presenter.request(unit);
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
    for (const entry of entries) {
      unreported.delete(entry.target);
      for (const unit of targets.get(entry.target) || []) {
        unit.visible = entry.isIntersecting;
        if (unit.state === "queued") enqueue(unit);
        // Sent before it was known to be on screen: it shows as waiting.
        else if (unit.visible && unit.state === "sent" && !unit.element)
          presenter.request(unit);
      }
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
    }, FRAME_MS);
  }

  function flush() {
    if (halted) return;
    if (!port) connect();
    // Batches wait for the session's limits.
    if (!config) return;
    // Paragraphs on screen go first, so sending waits until the observers
    // have said which those are.
    if (unreported.size) {
      const now = performance.now();
      waitingSince ||= now;
      if (now - waitingSince < VISIBILITY_WAIT_MS) {
        scheduleFlush();
        return;
      }
    } else waitingSince = 0;
    while (batches.size < config.limits.concurrency && queue.size) {
      const items = queue.take(config.limits, first);
      first = false;
      const texts = new Map<number, string>();
      const request: Array<{ id: number; text: string }> = [];
      for (const item of items) {
        const unit = units.units.get(item.id);
        if (!unit) continue;
        // A control's label isn't sent unless menus and buttons are
        // translated (styles tell some controls, such as a link drawn as a
        // button).
        if (presenter.place(unit)?.form === "skip") {
          unit.state = "skipped";
          continue;
        }
        unit.state = "sent";
        if (unit.visible) presenter.request(unit);
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
    // A translation that repeats its source adds nothing to show.
    const source = unit.paragraph.source;
    if (
      compact(translation) === source.text ||
      addsLittle(source.plain, plainText(translation))
    ) {
      clear(unit);
      return;
    }
    unit.translation = translation;
    unit.partial = undefined;
    presenter.request(unit);
  }

  function setView(view: PageTranslateView) {
    presenter.setTranslationOnly(
      view.display === PAGE_TRANSLATE_DISPLAY.translation,
    );
    if (view.translateMenus === translateMenus) return;
    translateMenus = view.translateMenus;
    presenter.placeAll();
    for (const unit of units.units.values())
      if (unit.state === "skipped") {
        unit.state = "idle";
        if (unit.near || smallPage) enqueue(unit);
      }
    scheduleFlush();
    void units.rescan(root, { translateMenus });
  }

  function clear(unit: Unit) {
    presenter.forget(unit);
    unit.translation = unit.partial = undefined;
  }

  function handle(event: PageTranslateEvent) {
    switch (event.type) {
      case "session":
        config = event.config;
        engine = config.engine;
        setView(config);
        // Waiting paragraphs translated before show at once.
        for (const unit of units.units.values())
          if (unit.state === "queued") enqueue(unit);
        flush();
        return;
      case "view":
        setView(event.view);
        return;
      case "switched":
        if (config)
          config = { ...config, engine: event.engine, limits: event.limits };
        engine = event.engine;
        toast(event.type, event.message, event.theme);
        scheduleFlush();
        return;
      case "partial": {
        const unit = units.units.get(event.id);
        if (unit?.state === "sent" && (unit.visible || unit.element)) {
          unit.partial = event.text;
          presenter.request(unit);
        }
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
        endBatch(event.batch, "failed");
        scheduleFlush();
        return;
      case "error":
        // The session couldn't start: the page goes back to its original,
        // with the note on it.
        if (event.batch === undefined) onFatal();
        else if (HALTING_ERRORS.has(event.kind)) halted = true;
        toast(event.kind, event.message, event.theme);
        return;
    }
  }

  // The batch is over: paragraphs it didn't translate failed (their
  // spinners and unfinished text go), or, when the connection closed, wait
  // to be asked for again.
  function endBatch(batch: number, outcome: "failed" | "idle") {
    for (const text of batches.get(batch)?.values() || []) {
      for (const unit of sent.get(text) || []) {
        unit.state = outcome;
        if (outcome === "failed") clear(unit);
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
      for (const batch of [...batches.keys()]) endBatch(batch, "idle");
      // Paragraphs still on or near the screen are asked for again.
      for (const unit of units.units.values())
        if (unit.state === "idle" && (unit.near || smallPage)) enqueue(unit);
      if (queue.size) scheduleFlush();
    });
    port.postMessage(startRequest());
  }

  const startRequest = (): PageTranslateRequest => ({
    type: "start",
    pageLanguage: document.documentElement.lang || undefined,
    title: document.title,
    engine,
  });

  connect();
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
      presenter.stop();
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
