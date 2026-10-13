// Breaks each sync safety guard on purpose and checks that a test fails.
//
//   node scripts/sync-mutations.mjs [<davUrlA> <davUrlB>]
//
// With the two URLs (one WebDAV folder through two hosts) the two-device
// script runs too. Refuses to run on a dirty tree, since every mutation is
// undone with `git checkout`.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { MUTATIONS } from "./sync-mutation-list.mjs";

const [davA, davB] = process.argv.slice(2);
const dirty = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (dirty.trim()) {
  console.error("Refusing to run: the working tree has uncommitted changes.");
  process.exit(2);
}

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
