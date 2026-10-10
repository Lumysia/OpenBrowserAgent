#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { join } from "node:path";
import {
  HOST_NAME,
  browsersFor,
  installPaths,
  nativeHostDir,
  nativeHostRegistryKeys,
  openBrowserAgentDir,
  parseArgs,
  readJson,
  readInstalledPaths,
  resolvePath,
  stringArg,
} from "./install-support.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge uninstall [options]

Options:
  --browser <target|all>       Browser target. Default: all
  --keep-config               Keep bridge shell config
  --config <path>             Bridge config path
  --bridge <path>             Runtime path
  --wrapper <path>            Wrapper path
  --manifest <path>           Native Messaging manifest path`);
  process.exit(0);
}
const targets = browsersFor(stringArg(args.browser || "all").toLowerCase());
const paths = installPaths(args);
const keepConfig = args["keep-config"] === true || args.keepConfig === true;
const removed = [];
const missing = [];
const registryKeys = [];
const kept = new Set(keepConfig ? [paths.configPath] : []);
const manifests = stringArg(args.manifest)
  ? [resolvePath(stringArg(args.manifest))]
  : targets.map((browser) => join(nativeHostDir(browser), `${HOST_NAME}.json`));
for (const path of new Set(manifests)) removeFile(path);
if (platform() === "win32") {
  for (const key of new Set(targets.flatMap(nativeHostRegistryKeys))) {
    const result = spawnSync("reg", ["delete", key, "/f"], {
      stdio: "pipe",
      windowsHide: true,
    });
    if (result.status === 0) {
      removed.push(key);
      registryKeys.push(key);
    } else missing.push(key);
  }
}
// Registrations can share a runtime/config even when wrappers differ. Keep
// referenced files until the last known registration is removed.
for (const browser of browsersFor("all")) {
  const manifest = readJson(join(nativeHostDir(browser), `${HOST_NAME}.json`));
  if (manifest?.name !== HOST_NAME) continue;
  try {
    for (const path of Object.values(readInstalledPaths(manifest.path)))
      kept.add(path);
  } catch {
    // Unknown wrapper ownership is not permission to delete shared files.
    for (const path of Object.values(paths)) kept.add(path);
  }
}
for (const path of Object.values(paths)) if (!kept.has(path)) removeFile(path);
try {
  const root = openBrowserAgentDir();
  if (existsSync(root) && !readdirSync(root).length) {
    rmdirSync(root);
    removed.push(root);
  }
} catch {
  /* A non-empty or locked directory can remain. */
}
console.log(
  JSON.stringify(
    {
      success: true,
      removed,
      missing,
      registryKeys,
      kept: Object.values(paths).filter((path) => kept.has(path)),
      note: "If an extension-side bridge configuration still exists in OpenBrowserAgent settings, delete it there too.",
    },
    null,
    2,
  ),
);

function removeFile(path) {
  if (!existsSync(path)) {
    missing.push(path);
    return;
  }
  rmSync(path, { force: true });
  removed.push(path);
}
