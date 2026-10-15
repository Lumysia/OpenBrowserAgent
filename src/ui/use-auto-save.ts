import { useEffect, useRef } from "react";
import { AUTO_SAVE_DELAY_MS } from "../shared/config";
import { canonicalJson } from "../shared/sync/codec";
import { useLatest } from "./use-latest";

// Saves `value` a moment after it last changed, and at once when the form
// goes away, so a form needs no Save button and loses nothing. `save` is
// called only with values that differ from the last one saved or loaded
// (`saved`).
export function useAutoSave<T>(value: T, saved: T, save: (value: T) => void) {
  const key = canonicalJson(value);
  const pending = useRef<T | undefined>(undefined);
  const latest = useLatest({ save, savedKey: canonicalJson(saved) });

  useEffect(() => {
    if (key === latest.current.savedKey) {
      pending.current = undefined;
      return;
    }
    pending.current = value;
    const timer = setTimeout(() => {
      pending.current = undefined;
      latest.current.save(value);
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // `value` is read through its key.
  }, [key]);

  useEffect(
    () => () => {
      if (pending.current !== undefined) latest.current.save(pending.current);
    },
    [latest],
  );
}
