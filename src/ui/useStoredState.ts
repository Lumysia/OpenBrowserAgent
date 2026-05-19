import { useEffect, useRef, useState, type MutableRefObject } from "react";

type StorageItem<T> = {
  key?: string;
  persistDebounceMs?: number;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

export function useStoredState<T>(item: StorageItem<T>) {
  const [value, setValue] = useState<T | undefined>();
  const valueRef = useRef<T | undefined>(undefined);
  const snapshotRef = useRef<string | undefined>(undefined);
  const ownWriteSnapshotsRef = useRef(new Set<string>());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingPersistRef = useRef<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    item.get().then((next) => {
      if (!mounted) return;
      valueRef.current = next;
      snapshotRef.current = snapshot(next);
      setValue(next);
      setLoading(false);
    });
    const unwatch = item.watch((next) => {
      const nextSnapshot = snapshot(next);
      if (nextSnapshot && nextSnapshot === snapshotRef.current) return;
      if (nextSnapshot && ownWriteSnapshotsRef.current.has(nextSnapshot)) {
        ownWriteSnapshotsRef.current.delete(nextSnapshot);
        return;
      }
      valueRef.current = next;
      snapshotRef.current = nextSnapshot;
      setValue(next);
    });
    return () => {
      mounted = false;
      flushPendingPersist(item, persistTimerRef, pendingPersistRef);
      unwatch();
    };
  }, [item]);

  async function update(next: T | ((previous: T) => T)) {
    const previous = valueRef.current;
    if (previous === undefined) return;
    const resolved =
      typeof next === "function"
        ? (next as (previous: T) => T)(previous)
        : next;
    const resolvedSnapshot = snapshot(resolved);
    valueRef.current = resolved;
    if (resolvedSnapshot) ownWriteSnapshotsRef.current.add(resolvedSnapshot);
    if (!item.persistDebounceMs) snapshotRef.current = resolvedSnapshot;
    setValue(resolved);
    persistValue(item, resolved, persistTimerRef, pendingPersistRef);
  }

  return [value, update, loading] as const;
}

function persistValue<T>(
  item: StorageItem<T>,
  value: T,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  pendingRef: MutableRefObject<T | undefined>,
) {
  if (!item.persistDebounceMs) {
    item.set(value).catch(logPersistError);
    return;
  }
  pendingRef.current = value;
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(() => {
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    timerRef.current = undefined;
    if (pending !== undefined) item.set(pending).catch(logPersistError);
  }, item.persistDebounceMs);
}

function flushPendingPersist<T>(
  item: StorageItem<T>,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  pendingRef: MutableRefObject<T | undefined>,
) {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = undefined;
  const pending = pendingRef.current;
  pendingRef.current = undefined;
  if (pending !== undefined) item.set(pending).catch(logPersistError);
}

function logPersistError(error: unknown) {
  console.warn("Failed to persist stored state", error);
}

function snapshot(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
