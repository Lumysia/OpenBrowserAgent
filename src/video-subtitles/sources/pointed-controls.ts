// The player's control the user points at or has focused, to tell its
// tooltip from captions: a tooltip shows over the video and changes its
// text as the pointer goes from control to control, as captions do. Found
// by structure only: what a tooltip says repeats the name the control has
// for assistive technology or as its title.

// The player's controls: never captions themselves.
export const CONTROLS =
  "button, input, select, textarea, a[href], [role=button], [role=slider], [role=menu], [role=menuitem], [role=tooltip], [role=dialog], [contenteditable]";
// Changes this soon after the pointer went onto a control or a part of it,
// or a control got the focus, may be its tooltip: they don't count as captions changing.
export const POINTED_MS = 500;
// Attributes that name an element (data-* ones by the words in their name,
// such as data-title or data-tooltip).
const LABEL_ATTRIBUTES = ["aria-label", "title", "alt"];
const DATA_LABEL = /^data-.*(title|tooltip|tip|label)/;
// Attributes that point at the elements naming or describing a control,
// tooltips among them.
const REFERENCES = ["aria-labelledby", "aria-describedby"];
// A tooltip may add to a label (a key to press) or shorten it; the shorter
// one is at least this part of the longer.
const MIN_LABEL_SHARE = 0.5;

const normalized = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLocaleLowerCase();

// Whether `text` repeats one of `labels`: the same words, or one holds the
// other and is not much longer.
export function repeatsLabel(text: string, labels: Iterable<string>) {
  const value = normalized(text);
  if (!/\p{L}/u.test(value)) return false;
  for (const label of labels) {
    const name = normalized(label);
    if (!/\p{L}/u.test(name)) continue;
    const [shorter, longer] =
      name.length < value.length ? [name, value] : [value, name];
    if (
      longer.includes(shorter) &&
      shorter.length >= longer.length * MIN_LABEL_SHARE
    )
      return true;
  }
  return false;
}

// The elements `element`'s REFERENCES point at.
function referenced(element: Element) {
  const document = element.ownerDocument;
  return REFERENCES.flatMap((name) =>
    (element.getAttribute(name) ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((id) => document.getElementById(id) ?? []),
  );
}

function hasLabel(element: Element) {
  return [...element.attributes].some(
    ({ name, value }) =>
      (LABEL_ATTRIBUTES.includes(name) || DATA_LABEL.test(name)) &&
      /\p{L}/u.test(value),
  );
}

// The control `target` is in, below `player`: the nearest element of the
// CONTROLS or with a label, not around `video`. Its chain from `target` up
// to it, innermost first.
export function controlChain(
  target: Element,
  player: Element,
  video: Element,
): Element[] {
  const chain: Element[] = [];
  for (
    let current: Element | null = target;
    current && current !== player && player.contains(current);
    current = current.parentElement
  ) {
    if (current.contains(video)) break;
    chain.push(current);
    if (current.matches(CONTROLS) || hasLabel(current)) return chain;
  }
  return [];
}

// What the elements of `chain` are called: their label attributes, the
// text of the elements they reference, and the control's own text.
export function labelsOf(chain: Element[]) {
  const labels: string[] = [];
  for (const element of chain) {
    for (const { name, value } of element.attributes)
      if (LABEL_ATTRIBUTES.includes(name) || DATA_LABEL.test(name))
        labels.push(value);
    for (const item of referenced(element)) labels.push(item.textContent ?? "");
  }
  const control = chain[chain.length - 1];
  if (control) labels.push(control.textContent ?? "");
  return labels;
}

export function watchPointedControls(player: Element, video: HTMLVideoElement) {
  // The chains of the control under the pointer and the focused one.
  let pointed: Element[] = [];
  let focused: Element[] = [];
  let pointedAt = -Infinity;

  const chainOf = (target: EventTarget | null) =>
    target instanceof Element ? controlChain(target, player, video) : [];
  const onPointer = (event: Event) => {
    pointed = chainOf(event.target);
    if (pointed.length) pointedAt = performance.now();
  };
  const onLeave = (event: Event) => {
    if (!(event as PointerEvent).relatedTarget) pointed = [];
  };
  const onFocus = (event: Event) => {
    focused = chainOf(event.target);
    if (focused.length) pointedAt = performance.now();
  };
  const onBlur = () => {
    focused = [];
  };
  const events: Array<[string, (event: Event) => void]> = [
    ["pointerover", onPointer],
    ["pointerout", onLeave],
    ["focusin", onFocus],
    ["focusout", onBlur],
  ];
  for (const [type, listener] of events)
    window.addEventListener(type, listener, { capture: true, passive: true });

  return {
    // Whether a change now may come from pointing at a control.
    recentlyPointed() {
      return performance.now() - pointedAt <= POINTED_MS;
    },
    // Whether `text` is what the tooltip of the control pointed at or
    // focused would say.
    isTooltip(text: string) {
      return [pointed, focused].some(
        (chain) => chain.length > 0 && repeatsLabel(text, labelsOf(chain)),
      );
    },
    dispose() {
      for (const [type, listener] of events)
        window.removeEventListener(type, listener, { capture: true });
    },
  };
}
