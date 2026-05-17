import { useEffect, useRef, useState } from "react";

type StorageItem<T> = {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

export function useStoredState<T>(item: StorageItem<T>) {
  const [value, setValue] = useState<T | undefined>();
  const valueRef = useRef<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    item.get().then((next) => {
      if (!mounted) return;
      valueRef.current = next;
      setValue(next);
      setLoading(false);
    });
    const unwatch = item.watch((next) => {
      valueRef.current = next;
      setValue(next);
    });
    return () => {
      mounted = false;
      unwatch();
    };
  }, [item]);

  async function update(next: T | ((previous: T) => T)) {
    const previous = valueRef.current ?? (await item.get());
    const resolved =
      typeof next === "function"
        ? (next as (previous: T) => T)(previous)
        : next;
    valueRef.current = resolved;
    setValue(resolved);
    await item.set(resolved).catch((error) => {
      console.warn("Failed to persist stored state", error);
    });
  }

  return [value, update, loading] as const;
}
