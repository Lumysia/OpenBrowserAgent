import { useLayoutEffect, useRef } from "react";

// The latest value, for timers and listeners set up once that must read the
// current props when they fire rather than the ones they started with.
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
