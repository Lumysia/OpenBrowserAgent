import { useEffect, useRef, useState, type MutableRefObject } from "react";

type StorageItem<T> = {
  key?: string;
  persistDebounceMs?: number;
  snapshot?: "hash";
  get(): Promise<T>;
  set(value: T): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

type StoredStateUpdateOptions = { persist?: "debounced" | "immediate" };

export function useStoredState<T>(item: StorageItem<T>) {
  const [value, setValue] = useState<T | undefined>();
  const valueRef = useRef<T | undefined>(undefined);
  const snapshotRef = useRef<string | undefined>(undefined);
  const ownWriteSnapshotsRef = useRef<OwnWriteSnapshots>({
    order: [],
    values: new Set(),
  });
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingPersistRef = useRef<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    item
      .get()
      .then((next) => {
        if (!mounted) return;
        valueRef.current = next;
        snapshotRef.current = snapshot(item, next);
        setValue(next);
      })
      .catch((error) => {
        console.warn(`Failed to load stored item ${item.key || ""}`, error);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const unwatch = item.watch((next) => {
      const nextSnapshot = snapshot(item, next);
      if (nextSnapshot && nextSnapshot === snapshotRef.current) return;
      if (consumeOwnWriteSnapshot(ownWriteSnapshotsRef, nextSnapshot)) {
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

  async function update(
    next: T | ((previous: T) => T),
    options: StoredStateUpdateOptions = {},
  ) {
    const previous = valueRef.current;
    if (previous === undefined) return;
    const resolved =
      typeof next === "function"
        ? (next as (previous: T) => T)(previous)
        : next;
    const resolvedSnapshot = snapshot(item, resolved);
    if (resolvedSnapshot && resolvedSnapshot === snapshotRef.current)
      return resolved;
    valueRef.current = resolved;
    snapshotRef.current = resolvedSnapshot;
    setValue(resolved);
    persistValue(
      item,
      resolved,
      persistTimerRef,
      pendingPersistRef,
      ownWriteSnapshotsRef,
      options,
    );
    return resolved;
  }

  return [value, update, loading] as const;
}

function persistValue<T>(
  item: StorageItem<T>,
  value: T,
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | undefined>,
  pendingRef: MutableRefObject<T | undefined>,
  ownWriteSnapshotsRef: MutableRefObject<OwnWriteSnapshots>,
  options: StoredStateUpdateOptions,
) {
  if (options.persist === "immediate") {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    pendingRef.current = undefined;
    persistOwnWrite(item, value, ownWriteSnapshotsRef).catch(logPersistError);
    return;
  }
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
    if (pending !== undefined)
      persistOwnWrite(item, pending, ownWriteSnapshotsRef).catch(
        logPersistError,
      );
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

async function persistOwnWrite<T>(
  item: StorageItem<T>,
  value: T,
  ownWriteSnapshotsRef: MutableRefObject<OwnWriteSnapshots>,
) {
  const valueSnapshot = snapshot(item, value);
  rememberOwnWriteSnapshot(ownWriteSnapshotsRef, valueSnapshot);
  try {
    await item.set(value);
  } catch (error) {
    forgetOwnWriteSnapshot(ownWriteSnapshotsRef, valueSnapshot);
    throw error;
  }
}

function logPersistError(error: unknown) {
  console.warn("Failed to persist stored state", error);
}

type OwnWriteSnapshots = { order: string[]; values: Set<string> };

const OWN_WRITE_SNAPSHOT_LIMIT = 4;

function rememberOwnWriteSnapshot(
  ref: MutableRefObject<OwnWriteSnapshots>,
  valueSnapshot: string | undefined,
) {
  if (!valueSnapshot || ref.current.values.has(valueSnapshot)) return;
  ref.current.values.add(valueSnapshot);
  ref.current.order.push(valueSnapshot);
  while (ref.current.order.length > OWN_WRITE_SNAPSHOT_LIMIT) {
    const expired = ref.current.order.shift();
    if (expired) ref.current.values.delete(expired);
  }
}

function consumeOwnWriteSnapshot(
  ref: MutableRefObject<OwnWriteSnapshots>,
  valueSnapshot: string | undefined,
) {
  if (!valueSnapshot || !ref.current.values.has(valueSnapshot)) return false;
  forgetOwnWriteSnapshot(ref, valueSnapshot);
  return true;
}

function forgetOwnWriteSnapshot(
  ref: MutableRefObject<OwnWriteSnapshots>,
  valueSnapshot: string | undefined,
) {
  if (!valueSnapshot) return;
  ref.current.values.delete(valueSnapshot);
  ref.current.order = ref.current.order.filter(
    (item) => item !== valueSnapshot,
  );
}

function snapshot(item: StorageItem<unknown>, value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    return item.snapshot === "hash" ? hashSnapshot(serialized) : serialized;
  } catch {
    return undefined;
  }
}

function hashSnapshot(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${hash >>> 0}`;
}
