// Zips the extension for each browser given (default: chrome) and appends
// the short commit hash to the zip files this run produced.
//
//   npm run zip [-- chrome firefox safari]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, parse } from "node:path";

const OUTPUT_DIR = ".output";
const browsers = process.argv.slice(2);
if (!browsers.length) browsers.push("chrome");

// Zip names with their modification times, so a zip that `wxt zip`
// overwrote in place counts as produced too.
const zips = () =>
  new Map(
    (existsSync(OUTPUT_DIR) ? readdirSync(OUTPUT_DIR) : [])
      .filter((name) => name.endsWith(".zip"))
      .map((name) => [name, statSync(join(OUTPUT_DIR, name)).mtimeMs]),
  );

const hash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

for (const browser of browsers) {
  const before = zips();
  // Through a shell so the local `wxt` bin resolves on Windows too.
  execFileSync(`npx wxt zip -b ${browser}`, { stdio: "inherit", shell: true });
  for (const [name, mtimeMs] of zips()) {
    if (before.get(name) === mtimeMs) continue;
    const { name: base, ext } = parse(name);
    const target = `${base}-${hash}${ext}`;
    rmSync(join(OUTPUT_DIR, target), { force: true });
    renameSync(join(OUTPUT_DIR, name), join(OUTPUT_DIR, target));
    console.log(`Renamed ${name} -> ${target}`);
  }
}
