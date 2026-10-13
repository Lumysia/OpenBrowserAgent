// The fifth review's guards.
export default [
  {
    name: "R2: a later clock of the same device id counts as including a change",
    file: "src/shared/sync/clocks.ts",
    from: "  return version.clock === clock || !!version.seen?.includes(clock);",
    to: "  return [version.clock, ...(version.seen ?? [])].some((held) => parseClock(held)?.device === parseClock(clock)?.device && compareClocks(held, clock) >= 0);",
  },
  {
    name: "R2: clocks carry no nonce",
    file: "src/shared/sync/hlc.ts",
    from: "  return [formatClock(next.wall, next.counter, device, newNonce()), next];",
    to: "  return [formatClock(next.wall, next.counter, device), next];",
  },
  {
    name: "R2: a version leaves out the clocks of its own device id",
    file: "src/shared/sync/clocks.ts",
    from: "      if (wall && wall >= oldest && held !== clock && !left.has(held))",
    to: "      if (wall && wall >= oldest && held !== clock && !left.has(held) && parseClock(held)?.device !== parseClock(clock)?.device)",
  },
  {
    name: "R2: a change on top of an unconfirmed one does not include it",
    file: "src/shared/sync/clocks.ts",
    from: "  const seen = seenFrom(clock, [previous], previous);",
    to: "  const seen = previous?.local ? previous.seen : seenFrom(clock, [previous], previous);",
  },
  {
    name: "R2: a clock of this device's id it never made goes unnoticed",
    file: "src/shared/sync/clocks.ts",
    from: "          foreign = true;",
    to: "          foreign = false;",
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
  {
    name: "R1: a merged change does not keep the version it was made from",
    file: "src/shared/sync/local.ts",
    from: "      items: { ...items, ...(hlc ? saveHlc(hlc) : {}) },\n      bodies,",
    to: "      items: { ...items, ...(hlc ? saveHlc(hlc) : {}) },",
  },
  {
    name: "R1: copies kept against remote deletions do not keep their base",
    file: "src/shared/sync/engine-merge.ts",
    from: "        items: saveHlc(hlc),\n        bodies: payloads,",
    to: "        items: saveHlc(hlc),",
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
];
