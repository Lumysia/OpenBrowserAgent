import { useEffect, useRef, useState } from "react";

const DEFAULT_REMOVE_DELAY_MS = 190;

export function useDeferredRemove(
  onRemove: () => void,
  delayMs = DEFAULT_REMOVE_DELAY_MS,
) {
  const [removing, setRemoving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function remove() {
    if (removing) return;
    setRemoving(true);
    timeoutRef.current = setTimeout(onRemove, delayMs);
  }

  return { removing, remove };
}
