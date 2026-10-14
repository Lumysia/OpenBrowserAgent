// The background sync service, locks, and runs that hold their chats.
export default [
  {
    name: "content downloads stored without re-checking the record's version",
    file: "src/background/sync/service.ts",
    from: "if ((await loadClocks(env.local, collection.name))[id]?.blob !== blob) {",
    to: "if (false) {",
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
    name: "clearing local data keeps the cleared records' clocks",
    file: "src/background/sync/service.ts",
    from: "      await env.local.remove([...removed, ...clockData.flat()]);",
    to: "      await env.local.remove(removed);",
  },
  {
    name: "clearing local data without the cleared keys' locks",
    file: "src/background/sync/service.ts",
    from: "  await withLocks(env.lock, removed.map(storageLockName), () =>",
    to: "  await withLocks(env.lock, [], () =>",
  },
  {
    name: "a prompt asked again forgets its answer",
    file: "src/background/sync/service.ts",
    from: "  return answered?.some((entry) => entry.keep === undefined) ? answered : asked;",
    to: "  return asked;",
  },
  {
    name: "P1: the background answers an attach to a missing run with an end",
    file: "src/background/stream-sessions.ts",
    from: '  if (!session) return post(port, { type: "notRunning" });',
    to: '  if (!session) return post(port, { type: "end" });',
  },
  {
    name: "P1: the panel stores an end for a run the background does not have",
    file: "entrypoints/sidepanel/stream-port.ts",
    from: "      onRunStopped(chatId, activeMessageId);",
    to: "      updateRunMetrics(activeMessageId, { endedAt: Date.now() });",
  },
  {
    name: "P2: a running chat is never held",
    file: "src/shared/sync/collections-chats.ts",
    from: "  hold: (id, env) => !!env.runActive?.(id),",
    to: "  hold: () => false,",
  },
  {
    name: "P2: the background's sync does not know which chats run",
    file: "src/background/sync/service.ts",
    from: "    runActive: isChatRunning,",
    to: "",
  },
  {
    name: "P2: a finished run kept for replay still holds its chat",
    file: "src/background/stream-sessions.ts",
    from: "  return !!session && !session.cleanupTimeout;",
    to: "  return !!session;",
  },
  {
    name: "R2: the new-id note is gone after the next round",
    file: "src/background/sync/service.ts",
    from: "  [SYNC_WARNINGS.clonedDevice]: 24 * 60 * 60_000,",
    to: "  [SYNC_WARNINGS.clonedDevice]: 0,",
  },
  {
    name: "R2: the new-id note never expires",
    file: "src/background/sync/service.ts",
    from: "    if (!(now - at < (KEPT_FOR_MS[warning] ?? 0))) delete next[warning];",
    to: "    void at;",
  },
];
