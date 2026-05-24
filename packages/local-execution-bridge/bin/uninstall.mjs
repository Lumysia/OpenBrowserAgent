#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

const HOST_NAME = "openbrowseragent.local_execution_bridge";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const browser = stringArg(args.browser || "all").toLowerCase();
assertSupportedBrowser(browser);
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
const manifestPaths = stringArg(args.manifest)
  ? [resolvePath(stringArg(args.manifest))]
  : browsersForUninstall(browser).map((targetBrowser) =>
      join(nativeHostDir(targetBrowser), `${HOST_NAME}.json`),
    );
const keepConfig = args["keep-config"] === true || args.keepConfig === true;

const removed = [];
const missing = [];
const registryKeys = [];
for (const manifestPath of manifestPaths) removeFile(manifestPath);
for (const targetBrowser of browsersForUninstall(browser))
  unregisterNativeHost(targetBrowser);
removeFile(wrapperPath);
removeFile(bridgePath);
if (!keepConfig) removeFile(configPath);
removeEmptyDirectory(openBrowserAgentDir());

console.log(
  JSON.stringify(
    {
      success: true,
      removed,
      missing,
      registryKeys,
      kept: keepConfig ? [configPath] : [],
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

function removeEmptyDirectory(path) {
  try {
    if (!existsSync(path) || readdirSync(path).length) return;
    rmdirSync(path);
    removed.push(path);
  } catch {
    // Leaving a non-empty or locked directory is safe and expected.
  }
}

function unregisterNativeHost(targetBrowser) {
  if (platform() !== "win32") return;
  const key = nativeHostRegistryKey(targetBrowser);
  const result = spawnSync("reg", ["delete", key, "/f"], {
    stdio: "pipe",
    windowsHide: true,
  });
  if (result.status === 0) {
    removed.push(key);
    registryKeys.push(key);
  } else {
    missing.push(key);
  }
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

function browsersForUninstall(targetBrowser) {
  if (targetBrowser === "all") {
    const common = [
      "chrome",
      "edge",
      "brave",
      "vivaldi",
      "chromium",
      "firefox",
      "librewolf",
    ];
    if (platform() !== "linux") return common;
    return [
      ...common,
      "firefox-flatpak",
      "chromium-flatpak",
      "brave-flatpak",
      "librewolf-flatpak",
      "firefox-snap",
      "chromium-snap",
      "brave-snap",
    ];
  }
  return [targetBrowser];
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
    parsed[key] = argValue;
  }
  return parsed;
}

function resolvePath(path) {
  if (!path.startsWith("~")) return resolve(path);
  return resolve(join(homedir(), path.slice(1)));
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

function assertSupportedBrowser(targetBrowser) {
  const supported = [
    "all",
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

function fail(message) {
  console.error(message);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge uninstall [options]

Options:
  --browser <all|chrome|edge|brave|vivaldi|chromium|firefox|librewolf|firefox-flatpak|chromium-flatpak|brave-flatpak|librewolf-flatpak|firefox-snap|chromium-snap|brave-snap>
                                           Browser target. Default: all
  --keep-config                             Keep bridge command config
  --config <path>                           Bridge config path
  --bridge <path>                           Stable bridge runtime path
  --wrapper <path>                          Stable wrapper executable path
  --manifest <path>                         Native Messaging manifest path`);
}
