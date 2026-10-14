// The round itself: root writes and validation, blobs, WebDAV, browser
// sync items and storing remote changes locally.
export default [
  {
    name: "skip If-Match on root writes",
    file: "src/shared/sync/webdav.ts",
    from: 'etag ? { "If-Match": etag } : replace ? {} : { "If-None-Match": "*" }',
    to: "{}",
    needsServer: true,
  },
  {
    name: "skip If-Match in the test server too",
    file: "tests/sync-fixtures.ts",
    from: `        !hooks.ignoreIfMatch &&
        (etag ? etag !== server.etag : !!server.root && !replace)`,
    to: "        false",
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
    name: "a round writes a chat without its content over content opened meanwhile",
    file: "src/shared/sync/local.ts",
    from: `        return !(
          write.body === undefined &&`,
    to: `        return true || !(
          write.body === undefined &&`,
  },
  {
    name: "remote changes stored without their clocks",
    file: "src/shared/sync/local.ts",
    from: "for (const id of ids) clocks[id] = byId.get(id)!.entry;",
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
    from: "      const written = await transport.writeRoot(next, etag, {",
    to: `      await deleteBlobs(transport, collected);
      const written = await transport.writeRoot(next, etag, {`,
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
    name: "a missed body change found by the commit is not recorded",
    file: "src/shared/sync/local.ts",
    from: "            await recordMissed(id, now);",
    to: "            void recordMissed;",
  },
  {
    name: "a push confirmed when the server accepts the write",
    file: "src/shared/sync/engine.ts",
    from: "      await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);",
    to: "      await updateEntries(env, outcome.pushes, snapshot, confirmedEntry, payloads);",
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
    from: "      await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);",
    to: "",
  },
  {
    name: "H1: roots with invalid seen clocks are applied",
    file: "src/shared/sync/root.ts",
    from: '    return "invalid seen clocks";',
    to: '    return "";',
  },
  {
    name: "a confirmation recreates the clock of a record cleared meanwhile",
    file: "src/shared/sync/engine.ts",
    from: "        if (clocks[id]) clocks[id] = await change(id, clocks[id], record);",
    to: "        clocks[id] = await change(id, clocks[id] ?? { clock: record.clock }, record);",
  },
  {
    name: "R2: a copied install keeps its device id",
    file: "src/shared/sync/engine.ts",
    from: "        device = await rotateDeviceId(env);",
    to: "        await Promise.resolve();",
  },
  {
    name: "R2: the round that renamed the device goes on under the old id",
    file: "src/shared/sync/engine.ts",
    from: "        context = { ...context, device };",
    to: "",
  },
  {
    name: "R1: a merged change does not keep the version it was made from",
    file: "src/shared/sync/local.ts",
    from: "      items: { ...items, ...(hlc ? saveHlc(hlc) : {}) },\n      bodies,",
    to: "      items: { ...items, ...(hlc ? saveHlc(hlc) : {}) },",
  },
  {
    name: "R1: a push or confirmation does not keep the pushed body",
    file: "src/shared/sync/engine.ts",
    from: "      await saveClocks(env, syncCollection(collection)!, clocks, { bodies });",
    to: "      await saveClocks(env, syncCollection(collection)!, clocks, {});",
  },
  {
    name: "R1: a writer stores clock entries itself",
    file: "src/shared/sync/local.ts",
    from: "        await saveClocks(env, collection, clocks, {\n          items: saveHlc(hlc),",
    to: "        await env.local.set({ [clocksKey(collection.name)]: clocks });\n        void ({\n          items: saveHlc(hlc),",
    also: [
      {
        from: "import {\n  changedEntry,",
        to: "import {\n  clocksKey,\n  changedEntry,",
      },
    ],
  },
  {
    name: "L1: a push is recorded only once its root write answers",
    file: "src/shared/sync/engine.ts",
    from: "      await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);\n      const written = await transport.writeRoot(next, etag, {",
    to: "      const written = await transport.writeRoot(next, etag, {",
    also: [
      {
        from: '      if (written.status === "ok") {\n        state.remote = { root: next, etag: written.etag };',
        to: '      if (written.status === "ok") {\n        await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);\n        state.remote = { root: next, etag: written.etag };',
      },
    ],
  },
];
