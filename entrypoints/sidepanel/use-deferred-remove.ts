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

export function useDeferredPresence(
  visible: boolean,
  delayMs = DEFAULT_REMOVE_DELAY_MS,
) {
  const [mounted, setMounted] = useState(visible);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setRemoving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setRemoving(true);
    const timeout = setTimeout(() => {
      setMounted(false);
      setRemoving(false);
    }, delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, mounted, visible]);

  return { mounted, removing };
}
