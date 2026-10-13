import { bodyFor } from "./blobs";
import { baseOf, entryOf, keepsOrder } from "./clocks";
import { hashJson } from "./codec";
import { isOrderId, type Collection } from "./collection";
import { recordIdOf, splitRecordId, syncCollection } from "./collections";
import type { SyncContext } from "./engine";
import {
  keepLocalCopies,
  localBodies,
  massDeletes,
  mergeRecord,
  restoreRemoteCopies,
} from "./engine-merge";
import { unknownAgeClock } from "./hlc";
import {
  applyToLocal,
  idsWithPrefix,
  type LocalWrite,
  type Payloads,
  type Snapshot,
} from "./local";
import { decide, type Decision, type DecisionInput } from "./plan";
import type { Root, SyncRecord } from "./root";
import {
  SYNC_WARNINGS,
  type MassDelete,
  type MassDeleteAnswer,
  type SyncWarning,
} from "./state";

export type Outcome = {
  pushes: Map<string, SyncRecord>;
  // This device's changes the remote root already holds.
  accepted: Map<string, SyncRecord>;
  warnings: SyncWarning[];
  massDelete?: MassDelete[];
};

// This device's side of one record, as `decide` takes it.
function localSide(
  device: string,
  snapshot: Snapshot,
  recordId: string,
): Pick<DecisionInput, "local" | "untracked" | "changedHere" | "base"> {
  const entry = snapshot.clocks.get(recordId);
  const copy = snapshot.copies.get(recordId) ?? null;
  const content = (clock: string): SyncRecord | undefined =>
    copy
      ? {
          clock,
          data:
            isOrderId(splitRecordId(recordId).id) &&
            entry?.order &&
            keepsOrder(copy.data, entry.order)
              ? entry.order
              : copy.data,
          ...(copy.blob ? { blob: copy.blob } : {}),
          ...(copy.size !== undefined ? { size: copy.size } : {}),
        }
      : undefined;
  if (!entry)
    return copy
      ? { local: content(unknownAgeClock(device)), untracked: true }
      : {};
  const version = entry.deleted
    ? { clock: entry.clock, deleted: true as const }
    : content(entry.clock);
  return {
    local: version && entry.seen ? { ...version, seen: entry.seen } : version,
    changedHere: !!entry.local,
    base: entry.base,
  };
}

// Decide every record of the enabled collections, write remote wins into
// local data with their clocks, and return what to push.
export async function reconcile(
  context: SyncContext,
  collections: Collection[],
  snapshot: Snapshot,
  remote: Root,
  payloads: Payloads,
  answers: MassDeleteAnswer[],
): Promise<Outcome> {
  const { env, transport, device } = context;
  const outcome: Outcome = {
    pushes: new Map(),
    accepted: new Map(),
    warnings: [],
  };
  const decisions = new Map<string, Decision>();
  for (const collection of collections) {
    const ids = new Set([
      ...idsWithPrefix(remote.records, collection),
      ...[...snapshot.copies.keys(), ...snapshot.clocks.keys()]
        .filter((recordId) => recordId.startsWith(`${collection.name}/`))
        .map((recordId) => splitRecordId(recordId).id),
    ]);
    for (const id of ids) {
      const recordId = recordIdOf(collection, id);
      if (snapshot.held.has(recordId)) continue;
      decisions.set(
        recordId,
        await decide({
          ...localSide(device, snapshot, recordId),
          remote: remote.records[recordId],
          mergesContent: !!collection.mergeBodies,
          secrets: collection.secrets,
          dataHash: hashJson,
        }),
      );
    }
  }

  const massDelete = massDeletes(collections, snapshot, remote, decisions);
  const answerOf = (entry: MassDelete) =>
    answers.find(
      (answer) =>
        answer.collections.includes(entry.collection) &&
        (answer.local === undefined || answer.local === !!entry.local),
    );
  if (massDelete.some((entry) => !answerOf(entry))) {
    outcome.massDelete = massDelete;
    return outcome;
  }
  // Kept: copies here upload again, items deleted here come back.
  const kept = (local: boolean) =>
    massDelete
      .filter((entry) => !!entry.local === local && answerOf(entry)!.keep)
      .map((entry) => syncCollection(entry.collection)!);
  await keepLocalCopies(
    context,
    kept(false),
    snapshot,
    remote,
    decisions,
    payloads,
  );
  restoreRemoteCopies(kept(true), remote, decisions);

  const writes = new Map<Collection, LocalWrite[]>();
  const addWrite = (collection: Collection, write: LocalWrite) =>
    writes.set(collection, [...(writes.get(collection) ?? []), write]);
  const merged = new Set<string>();
  const heldLocally = await localBodies(env, collections, decisions);

  for (const [recordId, decision] of decisions) {
    const collection = syncCollection(splitRecordId(recordId).collection)!;
    const { id } = splitRecordId(recordId);
    if (decision.kind === "accept")
      outcome.accepted.set(recordId, remote.records[recordId]);
    else if (decision.kind === "push")
      outcome.pushes.set(recordId, decision.record);
    else if (decision.kind === "apply") {
      const record = decision.record;
      let body: unknown;
      const needsBody =
        !record.deleted &&
        !!record.blob &&
        (!collection.lazy || heldLocally.has(recordId));
      if (needsBody) {
        const fetched = await bodyFor(
          transport,
          collection,
          record.blob!,
          payloads,
        );
        // Missing content is never a delete: the record waits.
        if (!fetched) {
          outcome.warnings.push(SYNC_WARNINGS.missingContent);
          continue;
        }
        body = fetched.body;
      }
      addWrite(collection, {
        recordId,
        record,
        body,
        entry: await entryOf(id, record),
      });
    } else if (decision.kind === "merge") {
      const result = await mergeRecord(
        context,
        collection,
        id,
        decision,
        payloads,
      );
      if (!result) {
        outcome.warnings.push(SYNC_WARNINGS.missingContent);
        continue;
      }
      merged.add(recordId);
      // The merge is a change made here, from the remote version.
      addWrite(collection, {
        recordId,
        record: result.record,
        body: result.body,
        entry: {
          ...(await entryOf(id, result.record)),
          local: true,
          base: await baseOf(remote.records[recordId]),
        },
      });
    }
  }

  // Edits made before this point have their clocks before anything is
  // stored over them.
  if (writes.size) await env.settleEdits?.();
  for (const [collection, list] of writes) {
    const written = await applyToLocal(
      env,
      device,
      collection,
      list,
      snapshot,
      payloads,
    );
    for (const write of list)
      if (merged.has(write.recordId) && written.has(write.recordId))
        outcome.pushes.set(write.recordId, write.record);
  }
  return outcome;
}
