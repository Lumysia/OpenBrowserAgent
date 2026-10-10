import { sameStorageValue } from "./storage-value";
import type { SyncBackend } from "./sync-backends";

// Backend writes accept complete snapshots. After the first migration write,
// sending a local-only snapshot again would tombstone merged cloud rows. Apply
// just the edits since our previous source snapshot to the latest remote value.
export function createTransitionUploader(backend: SyncBackend) {
  const sources = new Map<string, unknown>();
  return async (
    key: string,
    source: unknown,
    localBase?: { backendId: string; value: unknown },
  ) => {
    const remote = await backend.read(key);
    const detached =
      !sources.has(key) && localBase?.backendId === backend.config.id;
    const before = detached ? localBase.value : sources.get(key);
    // Preserve unchanged local members even when the cloud was initially empty,
    // then apply explicit edits/deletions since this dataset became local.
    const target = detached
      ? rebaseStorageEdit(undefined, before, remote)
      : remote;
    const next = rebaseStorageEdit(before, source, target);
    let merged = next;
    if (!sameStorageValue(next, remote)) {
      if (next === undefined) await backend.remove(key);
      else merged = (await backend.write(key, next)) ?? next;
    }
    sources.set(key, source);
    return merged;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Collections in stored documents use these stable identities: agents/chats/
// messages/models, agent workspaces, and workspace/skill files respectively.
const COLLECTION_IDENTITIES = ["id", "agentId", "path"] as const;

export function rebaseStorageEdit(
  before: unknown,
  after: unknown,
  target: unknown,
): unknown {
  if (sameStorageValue(before, after)) return target;
  if (
    isRecord(after) &&
    isRecord(target) &&
    (before === undefined || isRecord(before))
  ) {
    const result = new Map(Object.entries(target));
    for (const key of Object.keys(before || {})) {
      if (!Object.hasOwn(after, key)) result.delete(key);
    }
    for (const [key, value] of Object.entries(after)) {
      const next = rebaseStorageEdit(
        before && Object.hasOwn(before, key) ? before[key] : undefined,
        value,
        Object.hasOwn(target, key) ? target[key] : undefined,
      );
      if (next !== undefined) result.set(key, next);
      else result.delete(key);
    }
    return Object.fromEntries(result);
  }
  if (
    Array.isArray(after) &&
    Array.isArray(target) &&
    (before === undefined || Array.isArray(before))
  ) {
    const previous = before || [];
    const identity = COLLECTION_IDENTITIES.find((key) =>
      [previous, after, target].every(
        (items) =>
          items.every(
            (item) => isRecord(item) && typeof item[key] === "string",
          ) && new Set(items.map((item) => item[key])).size === items.length,
      ),
    );
    if (identity) {
      const byId = (items: Record<string, unknown>[]) =>
        new Map(items.map((item) => [item[identity], item]));
      const base = byId(previous);
      const incoming = byId(after);
      const remote = byId(target);
      return [
        ...after.map((item) =>
          rebaseStorageEdit(
            base.get(item[identity]),
            item,
            remote.get(item[identity]),
          ),
        ),
        ...target.filter(
          (item) => !base.has(item[identity]) && !incoming.has(item[identity]),
        ),
      ].filter((item) => item !== undefined);
    }
  }
  return after;
}
