import { execFileSync } from "node:child_process";
import { readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, parse } from "node:path";

const outputDir = ".output";
const hashedZipPattern = /-[0-9a-f]{7,}\.zip$/i;
const hash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

const zipFiles = readdirSync(outputDir)
  .filter((name) => name.endsWith(".zip"))
  .filter((name) => !hashedZipPattern.test(name))
  .map((name) => ({ name, mtimeMs: statSync(join(outputDir, name)).mtimeMs }))
  .sort((left, right) => right.mtimeMs - left.mtimeMs);

if (!zipFiles.length) {
  console.log(`No new zip files found in ${outputDir}.`);
  process.exit(0);
}

for (const { name } of zipFiles) {
  const parsed = parse(name);
  const nextName = `${parsed.name}-${hash}${parsed.ext}`;
  const source = join(outputDir, name);
  const target = join(outputDir, nextName);
  rmSync(target, { force: true });
  renameSync(source, target);
  console.log(`Renamed ${source} -> ${target}`);
}
