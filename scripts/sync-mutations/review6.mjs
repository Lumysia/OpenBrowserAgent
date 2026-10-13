// The sixth review's guards.
export default [
  {
    name: "L1: a push is recorded only once its root write answers",
    file: "src/shared/sync/engine.ts",
    from: '      await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);\n      const written = await transport.writeRoot(next, etag);\n      if (written.status === "ok") {\n',
    to: '      const written = await transport.writeRoot(next, etag);\n      if (written.status === "ok") {\n        await updateEntries(env, outcome.pushes, snapshot, sentEntry, payloads);\n',
  },
  {
    name: "L1: a change made on top of the remote version is merged with it",
    file: "src/shared/sync/plan.ts",
    from: "  if (includes(local, remote.clock)) return push(local);",
    to: "",
  },
  {
    name: "C1: seen keeps one clock per device id",
    file: "src/shared/sync/clocks.ts",
    from: "  return seen.size ? [...seen].sort() : undefined;",
    to: "  return seen.size ? [...new Map([...seen].sort().map((held) => [parseClock(held)!.device, held])).values()].sort() : undefined;",
  },
  {
    name: "C1: a version names its maker's own settled changes",
    file: "src/shared/sync/clocks.ts",
    from: "  const left = new Set(settled(from));",
    to: "  const left = new Set<Clock>();",
  },
  {
    name: "C1: a version leaves out its maker's changes still asked about",
    file: "src/shared/sync/clocks.ts",
    from: "  return (from?.own ?? []).filter((clock) => !keep.includes(clock));",
    to: "  return from?.own ?? [];",
  },
  {
    name: "C1: own clocks the replaced versions hold are forgotten",
    file: "src/shared/sync/clocks.ts",
    from: "  const holds = new Set([...held, ...versionsOf(from)].flatMap(heldBy));",
    to: "  const holds = new Set(held.flatMap(heldBy));",
  },
  {
    name: "C1: a change does not count its own clock as issued here",
    file: "src/shared/sync/clocks.ts",
    from: "  if (clock) own.push(clock);",
    to: "",
  },
  {
    name: "C1: an applied version forgets the own clocks it holds",
    file: "src/shared/sync/reconcile.ts",
    from: "        entry: await entryOf(id, record, snapshot.clocks.get(recordId)),",
    to: "        entry: await entryOf(id, record),",
  },
  {
    name: "C1: a confirmed version forgets the own clocks it holds",
    file: "src/shared/sync/clocks.ts",
    from: "  if (current.clock === record.clock) return entryOf(id, record, current);",
    to: "  if (current.clock === record.clock) return entryOf(id, record);",
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
  {
    name: "C1: a copy whose clocks run behind goes unnoticed",
    file: "src/shared/sync/clocks.ts",
    from: "            (!!oldestSent &&",
    to: "            (false &&",
  },
  {
    name: "C1: own clocks a version holds count as another install's",
    file: "src/shared/sync/clocks.ts",
    from: "    for (const clock of [...asked(entry), ...(entry.own ?? [])])",
    to: "    for (const clock of asked(entry))",
  },
  {
    name: "S1: seen names changes forever",
    file: "src/shared/sync/clocks.ts",
    from: "  const oldest = (parseClock(clock)?.wall ?? 0) - SEEN_KEEP_MS;",
    to: "  const oldest = 0;",
  },
  {
    name: "S2: loading a chat adds append: false to every part",
    file: "src/shared/chats.ts",
    from: "    append: part.append === true || undefined,",
    to: "    append: part.append === true,",
  },
];
