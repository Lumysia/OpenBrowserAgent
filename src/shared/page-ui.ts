// Every element the extension adds to a page (the smart bar, page notes,
// the translate button, subtitles, the element picker, the recording pill)
// carries this attribute on its outermost element, so features that watch
// what the user does on the page (a recording) can tell the extension's own
// UI from the page's. Closed shadow roots retarget events to that element.
export const OWN_UI_ATTRIBUTE = "data-oba-ui";

export function markOwnUi(element: Element) {
  element.setAttribute(OWN_UI_ATTRIBUTE, "");
}

export function isOwnUiEvent(event: Event) {
  return event
    .composedPath()
    .some(
      (node) => node instanceof Element && node.hasAttribute(OWN_UI_ATTRIBUTE),
    );
}
