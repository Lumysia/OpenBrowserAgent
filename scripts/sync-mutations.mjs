// Breaks each sync safety guard on purpose and checks that a test fails.
//
//   node scripts/sync-mutations.mjs [<davUrlA> <davUrlB>]
//
// With the two URLs (one WebDAV folder through two hosts) the two-device
// script runs too. Refuses to run on a dirty tree, since every mutation is
// undone with `git checkout`.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const [davA, davB] = process.argv.slice(2);
const dirty = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (dirty.trim()) {
  console.error("Refusing to run: the working tree has uncommitted changes.");
  process.exit(2);
}

const MUTATIONS = [
  {
    name: "skip If-Match on root writes",
    file: "src/shared/sync/webdav.ts",
    from: 'etag ? { "If-Match": etag } : { "If-None-Match": "*" }',
    to: "{}",
    needsServer: true,
  },
  {
    name: "skip If-Match in the test server too",
    file: "tests/sync-fixtures.ts",
    from: "if (!hooks.ignoreIfMatch && (etag ? etag !== server.etag : !!server.root))",
    to: "if (false)",
  },
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
    name: "apply an unvalidated root",
    file: "src/shared/sync/root.ts",
    from: "  return validateRoot(parsed);",
    to: "  return parsed as Root;",
  },
  {
    name: "skip the blob hash check",
    file: "src/shared/sync/webdav.ts",
    from: "if ((await sha256Hex(payload)) !== hash)",
    to: "if (false)",
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
    name: "content downloads stored without re-checking the record's version",
    file: "src/background/sync/service.ts",
    from: "if ((await loadClocks(env.local, collection.name))[id]?.blob !== blob) {",
    to: "if (false) {",
  },
  {
    name: "a round writes a chat without its content over content opened meanwhile",
    file: "src/shared/sync/local.ts",
    from: `        return !(
          write.body === undefined &&`,
    to: `        return true || !(
          write.body === undefined &&`,
  },
  {
    name: "clearing sync data without the sync lock",
    file: "src/background/sync/service.ts",
    from: "return env.lock(SYNC_LOCK, () => reset(env, context, remote, keys));",
    to: "return reset(env, context, remote, keys);",
  },
  {
    name: "chat content written without the content key's lock",
    file: "src/shared/sync/collections-chats.ts",
    from: "const locks = [CHATS, ...changes.map((change) => contentKey(change.id))];",
    to: "const locks = [CHATS];",
  },
  {
    name: "clock diff: every record of a changed key counts as changed",
    file: "src/shared/sync/track.ts",
    from: "if (sameJson(old, next) || (!next && !after.complete)) continue;",
    to: "if (!next && !after.complete) continue;",
  },
  {
    name: "clock diff: a record that has a clock gets a new one on any change of its key",
    file: "src/shared/sync/track.ts",
    from: "const edited = known\n          ? await differs(copy, known, collection.defaultData?.(id))",
    to: "const edited = known\n          ? true",
  },
  {
    name: "clock diff: a field never stored is not compared with its default",
    file: "src/shared/sync/track.ts",
    from: "(side.complete && collection.defaultData?.(id) !== undefined",
    to: "(false",
  },
  {
    name: "remote changes stored without their clocks",
    file: "src/shared/sync/local.ts",
    from: "for (const id of ids) clocks[id] = byId.get(id)!.entry;",
    to: "",
  },
  {
    name: "the edit listener records writes made together with their clocks",
    file: "src/shared/sync/track.ts",
    from: "if (clocksKey(collection.name) in changes) continue;",
    to: "",
  },
  {
    name: "clearing local data keeps the cleared records' clocks",
    file: "src/background/sync/service.ts",
    from: "...cleared.map((collection) => clocksKey(collection.name)),",
    to: "",
  },
  {
    name: "a value with no clock competes as if it were new",
    file: "src/shared/sync/plan.ts",
    from: "if (input.untracked) return conflict(input, local, remote, undefined, false);",
    to: "if (input.untracked) return push(local);",
  },
  {
    name: "an empty secret replaces the account's on a join",
    file: "src/shared/sync/plan.ts",
    from: `  if (!base)
    data = keepSecrets(data, mineWins ? theirs.data : mine.data, secrets);`,
    to: "",
  },
  {
    name: "pushes refer to content nobody can download",
    file: "src/shared/sync/engine.ts",
    from: "if (!payload) pushes.delete(recordId);",
    to: "if (false) pushes.delete(recordId);",
  },
  {
    name: "blobs the server lost are not uploaded again",
    file: "src/shared/sync/blobs.ts",
    from: "for (const [blob, bytes] of held) await transport.putBlob(blob, bytes);",
    to: "for (const [blob, bytes] of held) void [blob, bytes];",
  },
  {
    name: "garbage deleted before the root without it is written",
    file: "src/shared/sync/engine.ts",
    from: "      const written = await transport.writeRoot(next, etag);",
    to: `      await deleteBlobs(transport, collected);
      const written = await transport.writeRoot(next, etag);`,
  },
  {
    name: "F8 heal: an upload another device may have collected is not checked again",
    file: "src/shared/sync/engine.ts",
    from: "if (seen.has(hash)) (state.uploads ??= {})[hash] = now;",
    to: "if (false) (state.uploads ??= {})[hash] = now;",
  },
  {
    name: "F8 heal: a checked upload found missing is not uploaded again",
    file: "src/shared/sync/blobs.ts",
    from: `    await transport.putBlob(hash, bytes);
    uploads[hash] = now;`,
    to: `    uploads[hash] = now;`,
  },
  {
    name: "WebDAV requests without a timeout",
    file: "src/shared/sync/webdav.ts",
    from: `      signal: AbortSignal.timeout(
        Math.ceil(timeoutMs + bytes / UPLOAD_BYTES_PER_MS),
      ),`,
    to: "",
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
    name: "browser sync keeps parts of failed writes forever",
    file: "src/shared/sync/browser-sync.ts",
    from: "return now() - stillSeen[hash] < UNREFERENCED_PARTS_MS;",
    to: "return true;",
  },
  {
    name: "browser sync ages parts from a fixed time, not from when this device saw them",
    file: "src/shared/sync/browser-sync.ts",
    from: "stillSeen[hash] = seen[hash] ?? now();",
    to: "stillSeen[hash] = seen[hash] ?? 0;",
  },
  {
    name: "remote changes stored over a clock entry recorded since the snapshot",
    file: "src/shared/sync/local.ts",
    from: "        if (!sameJson(clocks[id], known)) return false;",
    to: "",
  },
  {
    name: "remote changes stored before the edit listener caught up",
    file: "src/shared/sync/reconcile.ts",
    from: "  if (writes.size) await env.settleEdits?.();",
    to: "",
  },
  {
    name: "a missed body change found by the commit is not recorded",
    file: "src/shared/sync/local.ts",
    from: "            await recordMissed(id, now);",
    to: "            void recordMissed;",
  },
  {
    name: "a push confirmed when the server accepts the write",
    file: "src/shared/sync/engine.ts",
    from: "        await updateEntries(env, outcome.pushes, snapshot, sentEntry);",
    to: "        await updateEntries(env, outcome.pushes, snapshot, confirmedEntry);",
  },
  {
    name: "a push confirmed by a remote record that does not include it",
    file: "src/shared/sync/engine.ts",
    from: "    if (entry.sent && now && includes(now, entry.sent.clock))",
    to: "    if (entry.sent && now)",
  },
  {
    name: "H1: pushes are not recorded, so a later change keeps its old base",
    file: "src/shared/sync/engine.ts",
    from: "        await updateEntries(env, outcome.pushes, snapshot, sentEntry);",
    to: "",
  },
  {
    name: "H1: a change made after a push forgets the push",
    file: "src/shared/sync/clocks.ts",
    from: "    ...(previous?.local && previous.sent ? { sent: previous.sent } : {}),",
    to: "",
  },
  {
    name: "H1: a remote version made from this change merges from the stale base",
    file: "src/shared/sync/plan.ts",
    from: "  if (input.changedHere && includes(remote, local.clock)) return apply(remote);",
    to: "",
  },
  {
    name: "H1: a change does not include the version it was made from",
    file: "src/shared/sync/clocks.ts",
    from: "  const seen = previous?.local ? previous.seen : seenFrom(clock, [previous]);",
    to: "  const seen = previous?.local ? previous.seen : undefined;",
  },
  {
    name: "H1: a merged version does not include the versions it merged",
    file: "src/shared/sync/engine-merge.ts",
    from: "  const seen = seenFrom(clock, decision.versions);",
    to: "  const seen = undefined;",
  },
  {
    name: "H1: pushed records do not say what they include",
    file: "src/shared/sync/reconcile.ts",
    from: "    local: version && entry.seen ? { ...version, seen: entry.seen } : version,",
    to: "    local: version,",
  },
  {
    name: "H1: a later clock of any device counts as including a change",
    file: "src/shared/sync/clocks.ts",
    from: "      parseClock(held)?.device === device && compareClocks(held, clock) >= 0,",
    to: "      compareClocks(held, clock) >= 0,",
  },
  {
    name: "H1: roots with invalid seen clocks are applied",
    file: "src/shared/sync/root.ts",
    from: '    return "invalid seen clocks";',
    to: '    return "";',
  },
  {
    name: "S2: the body a change was made from is not kept",
    file: "src/shared/sync/track.ts",
    from: "      const bases = await keepBases(env, collection, clocks, recordedBefore);",
    to: "      const bases = {};",
  },
  {
    name: "S2: the pushed version's body is not kept for a change made on top of it",
    file: "src/shared/sync/bases.ts",
    from: "  (clocks[id].base?.blob === blob || clocks[id].sent?.blob === blob);",
    to: "  clocks[id].base?.blob === blob;",
  },
  {
    name: "S2: a merge whose base was collected does not use the kept body",
    file: "src/shared/sync/engine-merge.ts",
    from: "        )) ?? (await keptBase(env, collection, id, merge.base)))",
    to: "        )))",
  },
  {
    name: "S2: kept bodies are never dropped",
    file: "src/shared/sync/engine.ts",
    from: "    await pruneBases(env, collections);",
    to: "",
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
    name: "B1: synced storage items keep a blind set",
    file: "src/shared/storage.ts",
    from: "  return { ...item, replace: set };",
    to: "  return { ...item, set, replace: set };",
  },
  {
    name: "B1: an MCP test stores the list it read before the test",
    file: "src/background/mcp-tools.ts",
    from: "  const server = (await storage.mcpServers.get()).find(",
    to: "  const read = await storage.mcpServers.get();\n  const server = read.find(",
    also: [
      {
        from: "  const next = await updateById(storage.mcpServers, serverId, (current) => {",
        to: "  const next = await updateById({ update: async (change: (list: typeof read) => typeof read) => { const value = change(read); await storage.mcpServers.replace(value); return value; } }, serverId, (current) => {",
      },
    ],
  },
  {
    name: "B1: a bridge test stores the list it read before the test",
    file: "src/background/local-execution-bridge-tools.ts",
    from: `  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result`,
    to: `  const read = await loadBridges();
  const bridge = read.find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result`,
    also: [
      {
        from: "  const tested = await updateById(\n    storage.localExecutionBridges,",
        to: "  const tested = await updateById(\n    { update: async (change: (list: typeof read) => typeof read) => { const value = change(read); await storage.localExecutionBridges.replace(value); return value; } },",
      },
    ],
  },
  {
    name: "B1: a skill edit stores the list it read first",
    file: "src/background/tools/skills.ts",
    from: "      : await updateById(storage.skills, existing.id, edit);",
    to: "      : await updateById({ update: async (change: (list: typeof all) => typeof all) => { const value = change(all); await storage.skills.replace(value); return value; } }, existing.id, edit);",
  },
  {
    name: "a confirmation recreates the clock of a record cleared meanwhile",
    file: "src/shared/sync/engine.ts",
    from: "        if (clocks[id]) clocks[id] = await change(id, clocks[id], record);",
    to: "        clocks[id] = await change(id, clocks[id] ?? { clock: record.clock }, record);",
  },
  {
    name: "fields both sides changed in one record: the newer record wins whole",
    file: "src/shared/sync/plan.ts",
    from: "    data = mergeFields(base.data, mine.data, theirs.data, mineNewer) ?? data;",
    to: "    data = data;",
  },
  {
    name: "a change's base keeps no data from the edit event",
    file: "src/shared/sync/clocks.ts",
    from: "    base.data = before.data;",
    to: "",
  },
  {
    name: "clearing local data without the cleared keys' locks",
    file: "src/background/sync/service.ts",
    from: "  await withLocks(env.lock, removed.map(storageLockName), () =>",
    to: "  await withLocks(env.lock, [], () =>",
  },
  {
    name: "page saves store their whole copy",
    file: "src/shared/rebase.ts",
    from: "  return item.update((current) => rebaseEdit(base, edited, current));",
    to: "  return item.update(() => edited);",
  },
  {
    name: "chat saves store the side panel's copy as is",
    file: "src/shared/chat-storage.ts",
    from: "    if (base && stored && !sameJson(stored, normalizeChatContent(base)))",
    to: "    if (false)",
  },
  {
    name: "a removed setting stored again as its default counts as a change",
    file: "src/shared/sync/clocks.ts",
    from: "    return defaultData === undefined || !sameJson(copy.data, defaultData);",
    to: "    return true;",
  },
  {
    name: "a mass-delete answer applies to both kinds of prompt",
    file: "src/shared/sync/reconcile.ts",
    from: "        (answer.local === undefined || answer.local === !!entry.local),",
    to: "        true,",
  },
  {
    name: "a prompt asked again forgets its answer",
    file: "src/background/sync/service.ts",
    from: "  return answered?.some((entry) => entry.keep === undefined) ? answered : asked;",
    to: "  return asked;",
  },
  {
    name: "items restored after a local mass delete keep the shortened order",
    file: "src/shared/sync/engine-merge.ts",
    from: "      restored.push(ORDER_ID);",
    to: "",
  },
];

const SYNC_TESTS = readdirSync("tests")
  .filter((name) => /^sync-.*\.test\.ts$/.test(name))
  .sort()
  .map((name) => `tests/${name}`);

function runTests() {
  const unit = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "--test",
      // A mutation that deadlocks fails its test instead of hanging.
      "--test-timeout=30000",
      ...SYNC_TESTS,
    ],
    { encoding: "utf8" },
  );
  const failed = [...unit.stdout.matchAll(/^✖ (.+?) \(\d/gm)].map(
    (match) => match[1],
  );
  if (davA && davB) {
    const devices = spawnSync(
      "node",
      ["--import", "tsx", "tests/sync-two-devices.ts", davA, davB],
      { encoding: "utf8" },
    );
    for (const match of devices.stdout.matchAll(/^FAIL (.+)$/gm))
      failed.push(`two devices: ${match[1]}`);
  }
  return [...new Set(failed)];
}

const results = [];
for (const mutation of MUTATIONS) {
  if (mutation.needsServer && !(davA && davB)) {
    results.push({ ...mutation, skipped: true });
    continue;
  }
  let source = readFileSync(mutation.file, "utf8");
  // Some mutations change more than one place of the file.
  for (const { from, to } of [mutation, ...(mutation.also ?? [])]) {
    if (!source.includes(from))
      throw new Error(
        `Mutation "${mutation.name}" no longer matches ${mutation.file}`,
      );
    source = source.replace(from, to);
  }
  writeFileSync(mutation.file, source);
  try {
    results.push({ ...mutation, failed: runTests() });
  } finally {
    execFileSync("git", ["checkout", "--", mutation.file]);
  }
}

let survivors = 0;
for (const result of results) {
  if (result.skipped) {
    console.log(`SKIP     ${result.name} (needs a WebDAV server)`);
    continue;
  }
  const caught = result.failed.length > 0;
  if (!caught) survivors++;
  console.log(`${caught ? "CAUGHT  " : "SURVIVED"} ${result.name}`);
  for (const name of result.failed.slice(0, 4))
    console.log(`           - ${name}`);
}
console.log(
  `\n${survivors} survivor(s) of ${results.filter((r) => !r.skipped).length}`,
);
process.exitCode = survivors ? 1 : 0;
