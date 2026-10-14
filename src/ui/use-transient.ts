import { useCallback, useEffect, useRef, useState } from "react";
import { QUICK_FEEDBACK_MS } from "../shared/config";

// A value shown for a moment, such as the id of the item whose ✓ shows after
// a copy or a test. Setting it again restarts the time; leaving the page
// stops the timer.
export function useTransient<T>(ms: number = QUICK_FEEDBACK_MS) {
  const [value, setValue] = useState<T>();
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (next: T) => {
      window.clearTimeout(timer.current);
      setValue(next);
      timer.current = window.setTimeout(() => setValue(undefined), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [value, show] as const;
}
