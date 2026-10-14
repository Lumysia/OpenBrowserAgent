// Breaks each sync safety guard on purpose and checks that a test fails.
// The guards live in scripts/sync-mutations/*.mjs, one default-exported list
// per file: each replaces `from` with `to` in `file` (and every `also`
// pair), and some test must then fail. `needsServer`: only the two-device
// WebDAV script notices it.
//
//   node scripts/sync-mutations.mjs [<davUrlA> <davUrlB>]
//
// With the two URLs (one WebDAV folder through two hosts) the two-device
// script runs too. Refuses to run on a dirty tree, since every mutation is
// undone with `git checkout`.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const MUTATION_DIR = new URL("./sync-mutations/", import.meta.url);
const MUTATIONS = (
  await Promise.all(
    readdirSync(MUTATION_DIR)
      .filter((name) => name.endsWith(".mjs"))
      .sort()
      .map(async (name) => (await import(new URL(name, MUTATION_DIR))).default),
  )
).flat();

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

const REPORTER = new URL("./test-failures-reporter.mjs", import.meta.url);

// Names of the failed tests. A run that exits non-zero without reporting a
// failed test (for example a mutation that no longer parses) still counts as
// caught, under a name that says so.
function runTests() {
  const unit = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      `--test-reporter=${REPORTER.href}`,
      // A mutation that deadlocks fails its test instead of hanging.
      "--test-timeout=30000",
      ...SYNC_TESTS,
    ],
    { encoding: "utf8" },
  );
  const failed = unit.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).name);
  if (unit.status !== 0 && !failed.length)
    failed.push(`unit tests crashed (exit ${unit.status ?? unit.signal})`);
  if (davA && davB) {
    const resultsFile = join(
      mkdtempSync(join(tmpdir(), "oba-sync-mutations-")),
      "results.json",
    );
    const devices = spawnSync(
      process.execPath,
      ["--import", "tsx", "tests/sync-two-devices.ts", davA, davB],
      {
        encoding: "utf8",
        env: { ...process.env, SYNC_RESULTS: resultsFile },
      },
    );
    const reported = existsSync(resultsFile)
      ? JSON.parse(readFileSync(resultsFile, "utf8")).failed
      : [];
    rmSync(dirname(resultsFile), { recursive: true, force: true });
    for (const name of reported) failed.push(`two devices: ${name}`);
    if (devices.status !== 0 && !reported.length)
      failed.push(
        `two devices crashed (exit ${devices.status ?? devices.signal})`,
      );
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
