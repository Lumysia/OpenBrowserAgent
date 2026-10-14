// Planning and merging a round: who wins, mass-delete guards, field and
// content merges, applying remote versions.
export default [
  {
    name: "treat a missing blob as deleted",
    file: "src/shared/sync/reconcile.ts",
    from: `        if (!fetched) {
          outcome.warnings.push(SYNC_WARNINGS.missingContent);
          continue;
        }`,
    to: `        if (!fetched) {
          const deleted = { clock: record.clock, deleted: true as const };
          addWrite(collection, { recordId, record: deleted, entry: deleted });
          continue;
        }`,
  },
  {
    name: "ignore tombstone clocks (a delete always wins)",
    file: "src/shared/sync/plan.ts",
    from: `  if (mine.deleted || theirs.deleted)
    return mineNewer ? push(mine) : apply(theirs);`,
    to: `  if (mine.deleted || theirs.deleted)
    return theirs.deleted ? apply(theirs) : push(mine);`,
  },
  {
    name: "drop the guard for remote mass deletions",
    file: "src/shared/sync/engine-merge.ts",
    from: "guard(collection, here, appliesDelete, false);",
    to: "",
  },
  {
    name: "drop the guard for mass deletions made here",
    file: "src/shared/sync/engine-merge.ts",
    from: "guard(collection, there, pushesDelete, true);",
    to: "",
  },
  {
    name: "missing remote record read as a delete",
    file: "src/shared/sync/plan.ts",
    from: "if (!remote) return local.deleted ? NONE : push(local);",
    to: "if (!remote) return apply({ clock: local.clock, deleted: true });",
  },
  {
    name: "a version newer than the remote one is not sent (lost write, other backend)",
    file: "src/shared/sync/plan.ts",
    from: "if (!input.changedHere) return mineNewer ? push(local) : apply(remote);",
    to: "if (!input.changedHere) return mineNewer ? NONE : apply(remote);",
  },
  {
    name: "a value with no clock competes as if it were new",
    file: "src/shared/sync/plan.ts",
    from: "if (input.untracked) return conflict(input, local, remote, undefined, false);",
    to: "if (input.untracked) return push(local);",
  },
  {
    name: "an empty API key is a record that replaces the account's",
    file: "src/shared/sync/stored-collections.ts",
    from: "return Object.values(data).every(isEmpty) ? undefined : { data };",
    to: "return { data };",
  },
  {
    name: "keeping after a mass delete re-uploads every record",
    file: "src/shared/sync/engine-merge.ts",
    from: "const wanted = new Set(decisionsIn(decisions, collection, appliesDelete));",
    to: "const wanted = new Set(decisionsIn(decisions, collection, () => true));",
  },
  {
    name: "kept records refer to content that is gone",
    file: "src/shared/sync/engine-merge.ts",
    from: "!stored.has(projection.blob)",
    to: "false",
  },
  {
    name: "remote changes stored before the edit listener caught up",
    file: "src/shared/sync/reconcile.ts",
    from: "  if (writes.size) await env.settleEdits?.();",
    to: "",
  },
  {
    name: "H1: a remote version made from this change merges from the stale base",
    file: "src/shared/sync/plan.ts",
    from: "  if (input.changedHere && includes(remote, local.clock)) return apply(remote);",
    to: "",
  },
  {
    name: "H1: a merged version does not include the versions it merged",
    file: "src/shared/sync/engine-merge.ts",
    from: "  const seen = seenFrom(clock, decision.versions, from);",
    to: "  const seen = undefined;",
  },
  {
    name: "H1: pushed records do not say what they include",
    file: "src/shared/sync/reconcile.ts",
    from: "    local: version && entry.seen ? { ...version, seen: entry.seen } : version,",
    to: "    local: version,",
  },
  {
    name: "S2: a merge whose base was collected does not use the kept body",
    file: "src/shared/sync/engine-merge.ts",
    from: "        )) ?? (await keptBase(env, collection, merge.base)))",
    to: "        )))",
  },
  {
    name: "S1: fields two devices changed merge one level deep",
    file: "src/shared/sync/plan.ts",
    from: `  const merged = mineNewer
    ? mergeChanges(base, mine, theirs)
    : mergeChanges(base, theirs, mine);`,
    to: "  const merged = mineNewer ? { ...theirs, ...mine } : { ...mine, ...theirs };",
  },
  {
    name: "fields both sides changed in one record: the newer record wins whole",
    file: "src/shared/sync/plan.ts",
    from: "    data = mergeFields(base.data, mine.data, theirs.data, mineNewer) ?? data;",
    to: "    data = data;",
  },
  {
    name: "a mass-delete answer applies to both kinds of prompt",
    file: "src/shared/sync/reconcile.ts",
    from: "        (answer.local === undefined || answer.local === !!entry.local),",
    to: "        true,",
  },
  {
    name: "items restored after a local mass delete keep the shortened order",
    file: "src/shared/sync/engine-merge.ts",
    from: "      restored.push(ORDER_ID);",
    to: "",
  },
  {
    name: "D2: workspaces that never agreed merge without a base",
    file: "src/shared/sync/collections.ts",
    from: '    newBody: () => createWorkspace("").files,',
    to: "",
  },
  {
    name: "D1: files differing only in edit time are different files",
    file: "src/shared/sync/merge-content.ts",
    from: "    sameFile,\n",
    to: "",
  },
  {
    name: "D1: equal entries still go through the conflict rule",
    file: "src/shared/sync/merge-content.ts",
    from: "    if (same(mineEntry, theirsEntry)) result.set(id, newerEntry);",
    to: "    if (false) result.set(id, newerEntry);",
  },
  {
    name: "W1: a newer reset to a default file counts as unchanged",
    file: "src/shared/sync/merge-content.ts",
    from: "    return time(reset) <= time(other);",
    to: "    return true;",
  },
  {
    name: "W1: a default file one side lacks is no base",
    file: "src/shared/sync/merge-content.ts",
    from: "    if (!mineFile || !theirsFile) return true;",
    to: "    if (!mineFile || !theirsFile) return false;",
  },
  {
    name: "R1: copies kept against remote deletions do not keep their base",
    file: "src/shared/sync/engine-merge.ts",
    from: "        items: saveHlc(hlc),\n        bodies: payloads,",
    to: "        items: saveHlc(hlc),",
  },
  {
    name: "seen: copies kept against deletions do not say what they include",
    file: "src/shared/sync/engine-merge.ts",
    from: "            ...(clocks[id].seen ? { seen: clocks[id].seen } : {}),",
    to: "",
  },
  {
    name: "merge: an id list always takes the preferred side's order",
    file: "src/shared/sync/merge-content.ts",
    from: "  const otherReordered =\n    sameJson(order(preferred), order(base)) &&",
    to: "  const otherReordered =\n    false &&",
  },
  {
    name: "L1: a change made on top of the remote version is merged with it",
    file: "src/shared/sync/plan.ts",
    from: "  if (includes(local, remote.clock)) return push(local);",
    to: "",
  },
  {
    name: "C1: an applied version forgets the own clocks it holds",
    file: "src/shared/sync/reconcile.ts",
    from: "        entry: await entryOf(id, record, snapshot.clocks.get(recordId)),",
    to: "        entry: await entryOf(id, record),",
  },
  {
    name: "C1: a merge forgets the own clocks it holds",
    file: "src/shared/sync/reconcile.ts",
    from: "          ...ownFrom(from, decision.versions, result.record.clock),",
    to: "",
  },
  {
    name: "C1: a merge names its maker's own settled changes",
    file: "src/shared/sync/engine-merge.ts",
    from: "  const seen = seenFrom(clock, decision.versions, from);",
    to: "  const seen = seenFrom(clock, decision.versions, undefined);",
  },
];
