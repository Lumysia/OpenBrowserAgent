import { useEffect, useRef, useState } from "react";

export function useThrottledText(value: string, delayMs: number) {
  const [displayValue, setDisplayValue] = useState(value);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const waitMs = Math.max(0, delayMs - (now - lastUpdateRef.current));
    const timeout = window.setTimeout(() => {
      lastUpdateRef.current = Date.now();
      setDisplayValue(value);
    }, waitMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return displayValue;
}
