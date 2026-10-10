#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  HOST_NAME,
  browsersFor,
  installPaths,
  installRuntime,
  nativeHostDir,
  parseArgs,
  readJson,
  resolvePath,
  stringArg,
  writeJson,
  writeManifest,
} from "./install-support.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge install --browser chrome --extension-id <id> [options]

Options:
  --browser <target>           Browser target. Default: chrome
  --extension-id <id>          Installed extension ID
  --command-id <id>            Shell config ID. Default: default
  --command-name <name>        Display name. Default: command ID
  --cwd <path>                 Default command working directory
  --shell <shell>              Shell executable
  --secret <token>             Use an existing bridge secret
  --rotate-secret true         Generate a new secret
  --config <path>              Bridge config path
  --bridge <path>              Stable runtime path
  --wrapper <path>             Wrapper executable path
  --manifest <path>            Native Messaging manifest path

Supported browsers: ${browsersFor("all").join(", ")}`);
  process.exit(0);
}

const browser = stringArg(args.browser || "chrome").toLowerCase();
if (browser === "all") throw new Error("Install requires one browser target.");
browsersFor(browser);
const extensionId = stringArg(args["extension-id"] || args.extensionId);
if (!extensionId) throw new Error("Missing --extension-id.");
const commandId = stringArg(args["command-id"] || args.commandId || "default");
const paths = installPaths(args);
const manifestPath = resolvePath(
  stringArg(args.manifest) || join(nativeHostDir(browser), `${HOST_NAME}.json`),
);
const existingConfig = readJson(paths.configPath, { commands: [] });
const commands = Array.isArray(existingConfig.commands)
  ? existingConfig.commands
  : [];
const existing = commands.find((item) => item?.id === commandId);
const secret =
  stringArg(args.secret) ||
  (!(args["rotate-secret"] || args.rotateSecret) &&
    stringArg(existing?.secret)) ||
  randomBytes(32).toString("hex");
const shell = stringArg(args.shell);
const cwd = stringArg(args.cwd);
writeJson(paths.configPath, {
  ...existingConfig,
  commands: [
    ...commands.filter((item) => item?.id !== commandId),
    {
      id: commandId,
      name: stringArg(args["command-name"] || args.commandName || commandId),
      secret,
      mode: "shell",
      ...(shell ? { shell } : {}),
      ...(cwd ? { cwd } : {}),
    },
  ],
});
installRuntime(paths);
const registryKeys = writeManifest(
  manifestPath,
  browser,
  extensionId,
  paths.wrapperPath,
);
console.log(
  JSON.stringify(
    {
      success: true,
      hostName: HOST_NAME,
      commandId,
      secret,
      ...paths,
      manifestPath,
      registryKey: registryKeys[0],
      registryKeys,
      nextExtensionConfig: {
        hostName: HOST_NAME,
        bridgeKey: commandId,
        secret,
      },
    },
    null,
    2,
  ),
);
