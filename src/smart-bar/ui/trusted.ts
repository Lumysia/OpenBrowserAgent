import type { SyntheticEvent } from "react";

// The bar acts on the user's own clicks and keys only. Page scripts can
// dispatch events, but never trusted ones. Accepted risk: a page can paint
// a click-through overlay over the bar, so the user clicks it unknowingly;
// that is still the user's click, and occlusion can't be detected reliably.
export function onTrusted<E extends SyntheticEvent>(
  handler: (event: E) => void,
) {
  return (event: E) => {
    if (event.nativeEvent.isTrusted) handler(event);
  };
}
