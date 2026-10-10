#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  HOST_NAME,
  browsersFor,
  installPaths,
  installRuntime,
  isFirefox,
  nativeHostDir,
  parseArgs,
  readJson,
  readInstalledPaths,
  stringArg,
  writeManifest,
} from "./install-support.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge update [--browser <target|all>]
  openbrowseragent-local-execution-bridge update --browser chrome --extension-id <id> [install options]

Without --extension-id, scans known Native Messaging manifest locations and refreshes installed runtimes.`);
  process.exit(0);
}
if (args["extension-id"] || args.extensionId) {
  await import("./install.mjs");
} else {
  const updated = [];
  const missing = [];
  const seen = new Set();
  for (const browser of browsersFor(
    stringArg(args.browser || "all").toLowerCase(),
  )) {
    const manifestPath = join(nativeHostDir(browser), `${HOST_NAME}.json`);
    if (seen.has(manifestPath)) continue;
    seen.add(manifestPath);
    if (!existsSync(manifestPath)) {
      missing.push(browser);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest?.name !== HOST_NAME)
      throw new Error(`Invalid bridge manifest: ${manifestPath}`);
    const extensionId = isFirefox(browser)
      ? stringArg(manifest.allowed_extensions?.[0])
      : stringArg(manifest.allowed_origins?.[0])
          .replace(/^chrome-extension:\/\//, "")
          .replace(/\/$/, "");
    if (!extensionId)
      throw new Error(`Could not detect extension ID: ${manifestPath}`);
    const paths = readInstalledPaths(
      stringArg(manifest.path) || installPaths().wrapperPath,
    );
    installRuntime(paths);
    const registryKeys = writeManifest(
      manifestPath,
      browser,
      extensionId,
      paths.wrapperPath,
    );
    updated.push({
      browser,
      extensionId,
      ...paths,
      manifestPath,
      registryKeys,
    });
  }
  if (!updated.length)
    throw new Error(
      `No installed ${HOST_NAME} manifests were found. Run install with --browser and --extension-id first.`,
    );
  console.log(JSON.stringify({ success: true, updated, missing }, null, 2));
}
