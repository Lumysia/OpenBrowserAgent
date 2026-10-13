import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { storeEdit } from "../shared/rebase";

type StorageItem<T> = {
  key?: string;
  get(): Promise<T>;
  update(updater: (current: T) => T): Promise<unknown>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

// `freshUpdates`: an updater function is stored by applying it to the
// stored value (locked read-modify-write), not by writing the value it gave
// for this page's copy, which may miss another context's latest write.
export function useStoredState<T>(
  item: StorageItem<T>,
  { freshUpdates = false } = {},
) {
  const [value, setValue] = useState<T | undefined>();
  const valueRef = useRef<T | undefined>(undefined);
  const initialLoadRef = useRef<Promise<void> | undefined>(undefined);
  const snapshotRef = useRef<string | undefined>(undefined);
  const ownWriteSnapshotsRef = useRef<OwnWriteSnapshots>({
    order: [],
    values: new Set(),
  });
  const [loading, setLoading] = useState(true);
  // While this page's own writes are in flight, a value from elsewhere may
  // predate them (e.g. sync bookkeeping re-storing what it read earlier).
  // Showing it would undo the page's write on screen, so it waits; storage
  // is read again once the writes are done.
  const writesInFlightRef = useRef(0);
  const missedUpdateRef = useRef(false);

  function show(next: T, nextSnapshot = snapshot(next)) {
    valueRef.current = next;
    snapshotRef.current = nextSnapshot;
    setValue(next);
  }

  useEffect(() => {
    let mounted = true;
    let receivedUpdate = false;
    initialLoadRef.current = item
      .get()
      .then((next) => {
        if (!mounted || receivedUpdate) return;
        valueRef.current = next;
        snapshotRef.current = snapshot(next);
        setValue(next);
      })
      .catch((error) => {
        console.warn(`Failed to load stored item ${item.key || ""}`, error);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const unwatch = item.watch((next) => {
      receivedUpdate = true;
      const nextSnapshot = snapshot(next);
      if (nextSnapshot && nextSnapshot === snapshotRef.current) return;
      if (consumeOwnWriteSnapshot(ownWriteSnapshotsRef, nextSnapshot)) {
        snapshotRef.current = nextSnapshot;
        return;
      }
      if (writesInFlightRef.current) {
        missedUpdateRef.current = true;
        return;
      }
      show(next, nextSnapshot);
    });
    return () => {
      mounted = false;
      unwatch();
    };
  }, [item]);

  async function update(next: T | ((previous: T) => T)) {
    // Controls can become usable before a slower storage item has loaded. Keep
    // the update pending so callers awaiting persistence cannot silently lose it.
    if (valueRef.current === undefined) await initialLoadRef.current;
    const previous = valueRef.current;
    if (previous === undefined)
      throw new Error(`Stored item ${item.key || ""} has not loaded`);
    const resolved =
      typeof next === "function"
        ? (next as (previous: T) => T)(previous)
        : next;
    const resolvedSnapshot = snapshot(resolved);
    if (resolvedSnapshot && resolvedSnapshot === snapshotRef.current)
      return resolved;
    show(resolved, resolvedSnapshot);
    // Resolves once stored; a failed write is logged, the value stays shown.
    // Stored over what storage holds then, keeping changes made elsewhere
    // that this page has not shown yet.
    const write =
      freshUpdates && typeof next === "function"
        ? () => item.update(next as (previous: T) => T)
        : () => storeEdit(item, previous, resolved);
    writesInFlightRef.current++;
    await persistOwnWrite(write, resolved, ownWriteSnapshotsRef).catch(
      (error) => console.warn("Failed to persist stored state", error),
    );
    if (--writesInFlightRef.current === 0 && missedUpdateRef.current) {
      missedUpdateRef.current = false;
      const stored = await item.get().catch(() => undefined);
      const storedSnapshot = snapshot(stored);
      if (stored !== undefined && storedSnapshot !== snapshotRef.current)
        show(stored, storedSnapshot);
    }
    return resolved;
  }

  return [value, update, loading] as const;
}

async function persistOwnWrite<T>(
  write: () => Promise<unknown>,
  value: T,
  ownWriteSnapshotsRef: MutableRefObject<OwnWriteSnapshots>,
) {
  const valueSnapshot = snapshot(value);
  rememberOwnWriteSnapshot(ownWriteSnapshotsRef, valueSnapshot);
  try {
    await write();
  } catch (error) {
    forgetOwnWriteSnapshot(ownWriteSnapshotsRef, valueSnapshot);
    throw error;
  }
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

function snapshot<T>(value: T) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
