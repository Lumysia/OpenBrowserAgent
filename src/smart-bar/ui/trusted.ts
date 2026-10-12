import type { SyntheticEvent } from "react";

// The bar acts on the user's own clicks and keys only. Page scripts can
// dispatch events, but never trusted ones.
export function onTrusted<E extends SyntheticEvent>(
  handler: (event: E) => void,
) {
  return (event: E) => {
    if (event.nativeEvent.isTrusted) handler(event);
  };
}
