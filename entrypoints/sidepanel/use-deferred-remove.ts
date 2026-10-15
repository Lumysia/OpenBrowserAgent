import { useEffect, useRef, useState } from "react";
import { cssDurationMs, DURATION_TOKEN } from "../../src/ui/motion";

// Waits out the --duration-remove animation of the element going away.
const removeDelayMs = () => cssDurationMs(DURATION_TOKEN.remove);

export function useDeferredRemove(onRemove: () => void) {
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
    timeoutRef.current = setTimeout(onRemove, removeDelayMs());
  }

  return { removing, remove };
}

export function useDeferredPresence(visible: boolean) {
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
    }, removeDelayMs());
    return () => clearTimeout(timeout);
  }, [mounted, visible]);

  return { mounted, removing };
}
