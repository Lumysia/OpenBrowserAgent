#!/usr/bin/env node
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST_NAME = "openbrowseragent.local_execution_bridge";
const DESCRIPTION = "OpenBrowserAgent local execution bridge";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceBridgeScript = resolve(scriptDir, "bridge.mjs");

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const browser = stringArg(args.browser || "chrome").toLowerCase();
assertSupportedBrowser(browser);
const extensionId = stringArg(args["extension-id"] || args.extensionId);
const command = stringArg(args.command);
const commandId = stringArg(args["command-id"] || args.commandId || "default");
const commandName = stringArg(
  args["command-name"] || args.commandName || commandId,
);
const cwd = stringArg(args.cwd);
const shell = args.shell === true || args.shell === "true";
const commandArgs = arrayArg(args["command-arg"] || args.commandArg);
const configPath = resolvePath(
  stringArg(args.config) ||
    join(openBrowserAgentDir(), "local-execution-bridge.config.json"),
);
const bridgePath = resolvePath(
  stringArg(args.bridge) ||
    join(openBrowserAgentDir(), "local-execution-bridge.mjs"),
);
const wrapperPath = resolvePath(
  stringArg(args.wrapper) ||
    join(
      openBrowserAgentDir(),
      platform() === "win32"
        ? "openbrowseragent-local-execution-bridge.cmd"
        : "openbrowseragent-local-execution-bridge",
    ),
);
const manifestPath = resolvePath(
  stringArg(args.manifest) || join(nativeHostDir(browser), `${HOST_NAME}.json`),
);

if (!extensionId) fail("Missing --extension-id.");
if (!command) fail("Missing --command.");
if (!existsSync(sourceBridgeScript))
  fail(`Bridge script not found: ${sourceBridgeScript}`);

const existingConfig = readJson(configPath, { commands: [] });
const existingCommands = Array.isArray(existingConfig.commands)
  ? existingConfig.commands
  : [];
const existingCommand = existingCommands.find((item) => item?.id === commandId);
const secret =
  stringArg(args.secret) ||
  (args["rotate-secret"] || args.rotateSecret
    ? generateSecret()
    : stringArg(existingCommand?.secret) || generateSecret());
const nextCommand = {
  id: commandId,
  name: commandName,
  secret,
  command,
  args: commandArgs,
  shell,
  ...(cwd ? { cwd } : {}),
};
const nextConfig = {
  ...existingConfig,
  commands: [
    ...existingCommands.filter((item) => item?.id !== commandId),
    nextCommand,
  ],
};

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
installBridgeRuntime(bridgePath);
writeWrapper(wrapperPath, configPath, bridgePath);
writeManifest(manifestPath, browser, extensionId, wrapperPath);
const registryKey = registerNativeHost(browser, manifestPath);

console.log(
  JSON.stringify(
    {
      success: true,
      hostName: HOST_NAME,
      commandId,
      secret,
      configPath,
      bridgePath,
      wrapperPath,
      manifestPath,
      registryKey,
      nextExtensionConfig: {
        hostName: HOST_NAME,
        agentKey: commandId,
        secret,
      },
    },
    null,
    2,
  ),
);

function installBridgeRuntime(path) {
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(sourceBridgeScript, path);
  if (platform() !== "win32") chmodSync(path, 0o755);
}

function writeWrapper(path, config, bridge) {
  mkdirSync(dirname(path), { recursive: true });
  if (platform() === "win32") {
    writeFileSync(
      path,
      [
        "@echo off",
        `set "OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=${config}"`,
        `"${process.execPath}" "${bridge}"`,
        "",
      ].join("\r\n"),
      "utf8",
    );
    return;
  }
  writeFileSync(
    path,
    [
      "#!/usr/bin/env sh",
      `OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=${shellQuote(config)} exec ${shellQuote(process.execPath)} ${shellQuote(bridge)}`,
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(path, 0o755);
}

function writeManifest(path, targetBrowser, extension, wrapper) {
  mkdirSync(dirname(path), { recursive: true });
  const manifest = isFirefox(targetBrowser)
    ? {
        name: HOST_NAME,
        description: DESCRIPTION,
        path: wrapper,
        type: "stdio",
        allowed_extensions: [extension],
      }
    : {
        name: HOST_NAME,
        description: DESCRIPTION,
        path: wrapper,
        type: "stdio",
        allowed_origins: [`chrome-extension://${extension}/`],
      };
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function registerNativeHost(targetBrowser, manifest) {
  if (platform() !== "win32") return undefined;
  const key = nativeHostRegistryKey(targetBrowser);
  const result = spawnSync(
    "reg",
    ["add", key, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"],
    {
      stdio: "pipe",
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    fail(
      `Failed to register Native Messaging host for ${targetBrowser}: ${String(result.stderr || result.stdout)}`,
    );
  return key;
}

function nativeHostDir(targetBrowser) {
  const os = platform();
  if (os === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    const appData =
      process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    if (isFirefox(targetBrowser))
      return join(appData, "Mozilla", "NativeMessagingHosts");
    if (targetBrowser === "edge")
      return join(
        localAppData,
        "Microsoft",
        "Edge",
        "User Data",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "brave")
      return join(
        localAppData,
        "BraveSoftware",
        "Brave-Browser",
        "User Data",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "vivaldi")
      return join(localAppData, "Vivaldi", "User Data", "NativeMessagingHosts");
    if (targetBrowser === "chromium")
      return join(
        localAppData,
        "Chromium",
        "User Data",
        "NativeMessagingHosts",
      );
    return join(
      localAppData,
      "Google",
      "Chrome",
      "User Data",
      "NativeMessagingHosts",
    );
  }
  if (os === "darwin") {
    if (isFirefox(targetBrowser))
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Mozilla",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "edge")
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Microsoft Edge",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "brave")
      return join(
        homedir(),
        "Library",
        "Application Support",
        "BraveSoftware",
        "Brave-Browser",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "vivaldi")
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Vivaldi",
        "NativeMessagingHosts",
      );
    if (targetBrowser === "chromium")
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Chromium",
        "NativeMessagingHosts",
      );
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
    );
  }
  if (isFirefox(targetBrowser))
    return join(homedir(), ".mozilla", "native-messaging-hosts");
  if (targetBrowser === "firefox-flatpak")
    return join(
      homedir(),
      ".var",
      "app",
      "org.mozilla.firefox",
      ".mozilla",
      "native-messaging-hosts",
    );
  if (targetBrowser === "firefox-snap")
    return join(
      homedir(),
      "snap",
      "firefox",
      "common",
      ".mozilla",
      "native-messaging-hosts",
    );
  if (targetBrowser === "librewolf")
    return join(homedir(), ".librewolf", "native-messaging-hosts");
  if (targetBrowser === "librewolf-flatpak")
    return join(
      homedir(),
      ".var",
      "app",
      "io.gitlab.librewolf-community",
      ".librewolf",
      "native-messaging-hosts",
    );
  if (targetBrowser === "chromium")
    return join(homedir(), ".config", "chromium", "NativeMessagingHosts");
  if (targetBrowser === "chromium-flatpak")
    return join(
      homedir(),
      ".var",
      "app",
      "org.chromium.Chromium",
      "config",
      "chromium",
      "NativeMessagingHosts",
    );
  if (targetBrowser === "chromium-snap")
    return join(
      homedir(),
      "snap",
      "chromium",
      "common",
      "chromium",
      "NativeMessagingHosts",
    );
  if (targetBrowser === "edge")
    return join(homedir(), ".config", "microsoft-edge", "NativeMessagingHosts");
  if (targetBrowser === "brave")
    return join(
      homedir(),
      ".config",
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    );
  if (targetBrowser === "brave-flatpak")
    return join(
      homedir(),
      ".var",
      "app",
      "com.brave.Browser",
      "config",
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    );
  if (targetBrowser === "brave-snap")
    return join(
      homedir(),
      "snap",
      "brave",
      "common",
      ".config",
      "BraveSoftware",
      "Brave-Browser",
      "NativeMessagingHosts",
    );
  if (targetBrowser === "vivaldi")
    return join(homedir(), ".config", "vivaldi", "NativeMessagingHosts");
  return join(homedir(), ".config", "google-chrome", "NativeMessagingHosts");
}

function nativeHostRegistryKey(targetBrowser) {
  if (isFirefox(targetBrowser))
    return `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`;
  if (targetBrowser === "edge")
    return `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`;
  if (targetBrowser === "brave")
    return `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`;
  if (targetBrowser === "vivaldi")
    return `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${HOST_NAME}`;
  if (targetBrowser === "chromium")
    return `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`;
  return `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
}

function openBrowserAgentDir() {
  const os = platform();
  if (os === "win32")
    return join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "OpenBrowserAgent",
    );
  if (os === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "OpenBrowserAgent",
    );
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "openbrowseragent",
  );
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [rawKey, inlineValue] = value.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.trim();
    const next = inlineValue ?? values[index + 1];
    const argValue =
      inlineValue !== undefined || !next?.startsWith("--") ? next : true;
    if (inlineValue === undefined && argValue !== true) index += 1;
    if (parsed[key] === undefined) parsed[key] = argValue;
    else parsed[key] = [...arrayArg(parsed[key]), String(argValue)];
  }
  return parsed;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function resolvePath(path) {
  if (!path.startsWith("~")) return resolve(path);
  return resolve(join(homedir(), path.slice(1)));
}

function arrayArg(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined) return [];
  return [String(value)];
}

function stringArg(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isFirefox(targetBrowser) {
  return [
    "firefox",
    "firefox-flatpak",
    "firefox-snap",
    "librewolf",
    "librewolf-flatpak",
  ].includes(targetBrowser);
}

function generateSecret() {
  return randomBytes(32).toString("hex");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(message);
  printHelp();
  process.exit(1);
}

function assertSupportedBrowser(targetBrowser) {
  const supported = [
    "chrome",
    "edge",
    "brave",
    "vivaldi",
    "chromium",
    "firefox",
    "librewolf",
    "firefox-flatpak",
    "chromium-flatpak",
    "brave-flatpak",
    "librewolf-flatpak",
    "firefox-snap",
    "chromium-snap",
    "brave-snap",
  ];
  if (supported.includes(targetBrowser)) return;
  if (targetBrowser === "safari")
    fail(
      "Safari is not supported by this local execution bridge because Safari Web Extensions do not use this Native Messaging API in OpenBrowserAgent.",
    );
  fail(`Unsupported browser target: ${targetBrowser}`);
}

function printHelp() {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge install --browser chrome --extension-id <id> --command <command> [options]

Options:
  --browser <chrome|edge|brave|vivaldi|chromium|firefox|librewolf|firefox-flatpak|chromium-flatpak|brave-flatpak|librewolf-flatpak|firefox-snap|chromium-snap|brave-snap>
                                           Browser target. Default: chrome
  --extension-id <id>                       Installed extension ID
  --command <command>                       Local CLI command to run for bridge tasks
  --command-arg <arg>                       Argument for the command; repeat as needed
  --command-id <id>                         Bridge command config ID. Default: default
  --command-name <name>                     Display name. Default: command ID
  --cwd <path>                              Default command working directory
  --shell true                              Run command through the shell
  --secret <token>                          Use an existing bridge secret
  --rotate-secret true                      Generate a new secret for this command ID
  --config <path>                           Bridge config path
  --bridge <path>                           Stable bridge runtime path
  --wrapper <path>                          Stable wrapper executable path
  --manifest <path>                         Native Messaging manifest path`);
}
