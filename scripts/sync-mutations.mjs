// Breaks each sync safety guard on purpose and checks that a test fails.
//
//   node scripts/sync-mutations.mjs [<davUrlA> <davUrlB>]
//
// With the two URLs (one WebDAV folder through two hosts) the two-device
// script runs too. Refuses to run on a dirty tree, since every mutation is
// undone with `git checkout`.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

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
    file: "src/shared/sync/engine.ts",
    from: `        if (!fetched) {
          outcome.warnings.push(SYNC_WARNINGS.missingContent);
          continue;
        }
        body = fetched.body;`,
    to: `        if (!fetched) {
          addWrite(collection, {
            recordId,
            record: { clock: record.clock, deleted: true },
          });
          continue;
        }
        body = fetched.body;`,
  },
  {
    name: "ignore tombstone clocks (a delete always wins)",
    file: "src/shared/sync/plan.ts",
    from: `  if (pending.deleted || remote.deleted)
    return mineNewer ? push(pending) : { kind: "apply", record: remote };`,
    to: `  if (pending.deleted || remote.deleted)
    return remote.deleted ? { kind: "apply", record: remote } : push(pending);`,
  },
  {
    name: "drop the mass-delete guard",
    file: "src/shared/sync/engine.ts",
    from: "if (massDelete.length && !options.allowMassDelete) {",
    to: "if (false) {",
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
    from: "(!remote || compareClocks(remote.clock, synced.clock) < 0)",
    to: "remote && compareClocks(remote.clock, synced.clock) < 0",
  },
];

function runTests() {
  const unit = spawnSync(
    "node",
    [
      "--import",
      "tsx",
      "--test",
      "tests/sync-units.test.ts",
      "tests/sync-engine.test.ts",
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
  const source = readFileSync(mutation.file, "utf8");
  if (!source.includes(mutation.from))
    throw new Error(
      `Mutation "${mutation.name}" no longer matches ${mutation.file}`,
    );
  writeFileSync(mutation.file, source.replace(mutation.from, mutation.to));
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
