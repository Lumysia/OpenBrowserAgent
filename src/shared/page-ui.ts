// Every element the extension adds to a page (the smart bar, page notes,
// the translate button, subtitles, the element picker, the recording pill)
// is registered here by its outermost element, so features that watch what
// the user does on the page (a recording) can tell the extension's own UI
// from the page's. Closed shadow roots retarget events to that element.
//
// Known by identity, not by an attribute a page could set: the set lives on
// the global object of the extension's isolated world, which all its
// content scripts share and page scripts cannot reach.
const OWN_UI_GLOBAL = "__obaOwnUi";

function ownUi() {
  const globals = globalThis as typeof globalThis & {
    [OWN_UI_GLOBAL]?: WeakSet<Element>;
  };
  return (globals[OWN_UI_GLOBAL] ??= new WeakSet());
}

export function markOwnUi(element: Element) {
  ownUi().add(element);
}

export function isOwnUi(element: Element) {
  return ownUi().has(element);
}

export function isOwnUiEvent(event: Event) {
  return event
    .composedPath()
    .some((node) => node instanceof Element && isOwnUi(node));
}
