// How each paragraph's translation shows in the page, following the display
// setting and the room the page gives it. Changes wait for the next frame
// and go in together: the page's layout is read once before them and once
// after, never between two changes.
import {
  boxesOf,
  breaksLayout,
  choosePlacement,
  measureArea,
  tighter,
  type AreaBox,
  type Form,
} from "./layout";
import {
  removeTooltip,
  removeTranslation,
  showPending,
  showPartial,
  showTooltip,
  showTranslation,
  type ElementForm,
  type Look,
} from "./render";
import { swapIn, swapOut } from "./swap";
import type { Unit } from "./units";

// When the page gets no frames (a background tab), changes go in anyway.
const FRAME_FALLBACK_MS = 100;

type PresenterOptions = {
  language: () => string;
  units: () => Iterable<Unit>;
  // Runs our changes to the page's own text (see units.mute).
  mute: (change: () => void) => void;
  // Whether controls' labels are translated too.
  translateMenus: () => boolean;
};

// Forms that apply to every unit of a kind; hidden and skipped units are
// decided one by one.
const SHARED_FORMS = new Set<Form>(["block", "inline", "tooltip"]);

export function createPresenter({
  language,
  units,
  mute,
  translateMenus,
}: PresenterOptions) {
  const dirty = new Set<Unit>();
  // Tables and rows a translation made too wide: everything in them shows
  // as a tooltip.
  const compact = new WeakSet<Element>();
  // The form of each kind of unit: the tightest any of its units needed.
  const kinds = new Map<string, Form>();
  let translationOnly = false;
  let frame: number | undefined;
  let timer: number | undefined;

  const elementForm = (form?: Form): ElementForm | undefined =>
    form === "block" || form === "inline" ? form : undefined;

  function schedule() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(paint);
    timer = window.setTimeout(paint, FRAME_FALLBACK_MS);
  }

  // Units whose inline translation filled the line of a row item and
  // wrapped: they keep a line of their own where their kind continues the
  // line, also when they are placed again.
  const ownLines = new WeakSet<Unit>();
  const ownLineOf = (unit: Unit, form: Form): Form =>
    ownLines.has(unit) && form === "inline" ? "block" : form;

  // Gives the unit its kind's form, or its kind a tighter form. Returns
  // the kind when it got tighter.
  function shareForm(unit: Unit) {
    const placement = unit.placement;
    if (!placement?.kind || !SHARED_FORMS.has(placement.form)) return;
    const known = kinds.get(placement.kind);
    const shared = known ? tighter(placement.form, known) : placement.form;
    placement.form = ownLineOf(unit, shared);
    if (shared === known) return;
    kinds.set(placement.kind, shared);
    return known && placement.kind;
  }

  // Units of the kinds, shown in the kinds' forms now.
  function unitsOfKinds(changed: Set<string>) {
    const found = new Set<Unit>();
    if (!changed.size) return found;
    for (const unit of units()) {
      const placement = unit.placement;
      if (!placement?.kind || !changed.has(placement.kind)) continue;
      if (!SHARED_FORMS.has(placement.form)) continue;
      placement.form = ownLineOf(
        unit,
        tighter(placement.form, kinds.get(placement.kind)!),
      );
      found.add(unit);
    }
    return found;
  }

  function paint() {
    cancelAnimationFrame(frame!);
    clearTimeout(timer);
    frame = timer = undefined;
    const batch = new Set(dirty);
    dirty.clear();
    // Read: the room around paragraphs that show for the first time, and
    // the areas new translations go into.
    const tightened = new Set<string>();
    for (const unit of batch) {
      unit.placement ??= choosePlacement(
        unit.paragraph,
        compact,
        translateMenus(),
      );
      const kind = shareForm(unit);
      if (kind) tightened.add(kind);
    }
    for (const unit of unitsOfKinds(tightened)) batch.add(unit);
    const checked = [...batch].filter(
      (unit) =>
        !translationOnly &&
        unit.translation !== undefined &&
        elementForm(unit.placement?.form),
    );
    const before = new Map<Element, AreaBox>();
    for (const { placement } of checked)
      for (const box of boxesOf(placement!))
        if (!before.has(box)) before.set(box, measureArea(box));
    const page = document.documentElement;
    const width = checked.length ? page.scrollWidth : 0;
    // Write.
    mute(() => batch.forEach(apply));
    if (!checked.length) return;
    // Read: what the new translations did to the page.
    const pageGrew = page.scrollWidth > width + 1;
    const areas = new Set<Element>();
    const lines = new Set<Unit>();
    const broken = checked.filter((unit) => {
      const breakage =
        unit.element &&
        breaksLayout(unit.element, unit.placement!, before, pageGrew);
      if (breakage === "area") areas.add(unit.placement!.area!);
      if (breakage !== "line") return !!breakage;
      ownLines.add(unit);
      unit.placement!.form = "block";
      lines.add(unit);
      return false;
    });
    if (!broken.length) {
      if (lines.size) mute(() => lines.forEach(apply));
      return;
    }
    // Write: the compact form for the kinds they broke (in their container)
    // and for the tables and rows they made too wide, also for the
    // translations already there.
    for (const area of areas) compact.add(area);
    const brokenKinds = new Set<string>();
    for (const { placement } of broken)
      if (placement!.kind) {
        kinds.set(placement!.kind, "tooltip");
        brokenKinds.add(placement!.kind);
      }
    const fallback = unitsOfKinds(brokenKinds);
    for (const unit of broken) fallback.add(unit);
    for (const unit of units()) {
      const area = unit.placement?.area;
      if (area && areas.has(area)) fallback.add(unit);
    }
    for (const unit of fallback)
      if (elementForm(unit.placement?.form)) unit.placement!.form = "tooltip";
    for (const unit of lines) fallback.add(unit);
    mute(() => fallback.forEach(apply));
  }

  function apply(unit: Unit) {
    const { paragraph } = unit;
    const translation = unit.translation;
    const form = unit.placement?.form;
    if (form === "skip") {
      removeShown(unit);
      if (unit.swap) swapOut(unit.swap);
      unit.swap = undefined;
      return;
    }
    if (translation !== undefined && translationOnly) {
      removeShown(unit);
      unit.swap ??= swapIn(paragraph.source, translation);
      return;
    }
    if (unit.swap) swapOut(unit.swap);
    unit.swap = undefined;
    const flowForm = elementForm(form);
    const inFlow: Look | undefined = flowForm && {
      mark: false,
      ...unit.placement?.look,
      form: flowForm,
    };
    if (translation !== undefined && form === "tooltip") {
      removeTranslation(unit.element);
      unit.element = undefined;
      unit.tooltip = showTooltip(paragraph, translation, unit.tooltip);
      return;
    }
    removeTooltip(unit.tooltip);
    unit.tooltip = undefined;
    if (!inFlow) {
      // Hidden, or not rendered yet.
      removeTranslation(unit.element);
      unit.element = undefined;
    } else if (translation !== undefined)
      unit.element = showTranslation(
        paragraph,
        language(),
        inFlow,
        translation,
        unit.element,
      );
    else if (unit.partial !== undefined)
      unit.element = showPartial(
        paragraph,
        language(),
        inFlow,
        unit.partial,
        unit.element,
      );
    else if (unit.state === "sent")
      unit.element = showPending(paragraph, language(), inFlow, unit.element);
  }

  function removeShown(unit: Unit) {
    removeTranslation(unit.element);
    removeTooltip(unit.tooltip);
    unit.element = unit.tooltip = undefined;
  }

  return {
    // The unit's place in the page, decided now if it wasn't yet.
    place(unit: Unit) {
      unit.placement ??= choosePlacement(
        unit.paragraph,
        compact,
        translateMenus(),
      );
      return unit.placement;
    },
    // Shows the unit's current state in the next frame.
    request(unit: Unit) {
      dirty.add(unit);
      schedule();
    },
    // Takes the unit's translation out of the page at once.
    forget(unit: Unit) {
      dirty.delete(unit);
      removeShown(unit);
      const swap = unit.swap;
      if (swap) mute(() => swapOut(swap));
      unit.swap = undefined;
    },
    setTranslationOnly(on: boolean) {
      if (on === translationOnly) return;
      translationOnly = on;
      for (const unit of units())
        if (unit.translation !== undefined) dirty.add(unit);
      schedule();
    },
    // Places every translation again (controls show or not).
    placeAll() {
      kinds.clear();
      for (const unit of units()) {
        unit.placement = undefined;
        if (unit.translation !== undefined) dirty.add(unit);
      }
      schedule();
    },
    stop() {
      cancelAnimationFrame(frame!);
      clearTimeout(timer);
      frame = timer = undefined;
      dirty.clear();
    },
  };
}
