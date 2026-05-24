#!/usr/bin/env node
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
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

if (args["extension-id"] || args.extensionId) {
  await import("./install.mjs");
} else {
  updateInstalledBridges();
}

function updateInstalledBridges() {
  if (!existsSync(sourceBridgeScript))
    fail(`Bridge script not found: ${sourceBridgeScript}`);
  const browserArg = stringArg(args.browser || "all").toLowerCase();
  const targets = browsersForUpdate(browserArg);
  const seenManifests = new Set();
  const updated = [];
  const missing = [];
  for (const browser of targets) {
    const manifestPath = join(nativeHostDir(browser), `${HOST_NAME}.json`);
    if (seenManifests.has(manifestPath)) continue;
    seenManifests.add(manifestPath);
    if (!existsSync(manifestPath)) {
      missing.push({ browser, manifestPath });
      continue;
    }
    const result = updateManifestInstall(browser, manifestPath);
    updated.push(result);
  }
  if (!updated.length) {
    fail(
      `No installed ${HOST_NAME} manifests were found. Run install once with --browser and --extension-id first.`,
    );
  }
  console.log(
    JSON.stringify(
      {
        success: true,
        updated,
        missing: missing.map((item) => item.browser),
      },
      null,
      2,
    ),
  );
}

function updateManifestInstall(browser, manifestPath) {
  const manifest = readJson(manifestPath, undefined);
  if (!manifest || manifest.name !== HOST_NAME)
    fail(`Manifest is not an ${HOST_NAME} manifest: ${manifestPath}`);
  const extensionId = extensionIdFromManifest(manifest, browser);
  if (!extensionId)
    fail(`Could not detect extension ID from manifest: ${manifestPath}`);
  const wrapperPath = stringArg(manifest.path) || defaultWrapperPath();
  const wrapperInfo = readWrapperInfo(wrapperPath);
  const configPath = wrapperInfo.configPath || defaultConfigPath();
  const bridgePath = wrapperInfo.bridgePath || defaultBridgePath();

  installBridgeRuntime(bridgePath);
  writeWrapper(wrapperPath, configPath, bridgePath);
  writeManifest(manifestPath, browser, extensionId, wrapperPath);
  const registryKeys = registerNativeHost(browser, manifestPath) || [];
  return {
    browser,
    extensionId,
    configPath,
    bridgePath,
    wrapperPath,
    manifestPath,
    registryKeys,
  };
}

function extensionIdFromManifest(manifest, browser) {
  if (isFirefox(browser)) {
    const value = Array.isArray(manifest.allowed_extensions)
      ? manifest.allowed_extensions[0]
      : "";
    return stringArg(value);
  }
  const origin = Array.isArray(manifest.allowed_origins)
    ? String(manifest.allowed_origins[0] || "")
    : "";
  return origin.replace(/^chrome-extension:\/\//, "").replace(/\/$/, "");
}

function readWrapperInfo(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (platform() === "win32") {
    const configPath = matchFirst(
      text,
      /OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=([^"\r\n]+)/,
    );
    const bridgePath = matchFirst(
      text,
      /"[^"]*node(?:\.exe)?"\s+"([^"]+local-execution-bridge\.mjs)"/i,
    );
    return { configPath, bridgePath };
  }
  const configPath = unquoteShellValue(
    matchFirst(text, /OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=([^\s]+)\s+exec/),
  );
  const bridgePath = unquoteShellValue(
    matchFirst(text, /exec\s+[^\s]+\s+([^\s]+local-execution-bridge\.mjs)/),
  );
  return { configPath, bridgePath };
}

function matchFirst(text, pattern) {
  return stringArg(text.match(pattern)?.[1]);
}

function unquoteShellValue(value) {
  const text = stringArg(value);
  if (!text.startsWith("'") || !text.endsWith("'")) return text;
  return text.slice(1, -1).replaceAll("'\\''", "'");
}

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
  const keys = nativeHostRegistryKeys(targetBrowser);
  for (const key of keys) {
    const result = spawnSync(
      "reg",
      ["add", key, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"],
      { stdio: "pipe", windowsHide: true },
    );
    if (result.status !== 0)
      fail(
        `Failed to register Native Messaging host for ${targetBrowser}: ${String(result.stderr || result.stdout)}`,
      );
  }
  return keys;
}

function browsersForUpdate(targetBrowser) {
  const common = [
    "chrome",
    "edge",
    "brave",
    "vivaldi",
    "chromium",
    "firefox",
    "librewolf",
  ];
  const linuxPackaged = [
    "firefox-flatpak",
    "chromium-flatpak",
    "brave-flatpak",
    "librewolf-flatpak",
    "firefox-snap",
    "chromium-snap",
    "brave-snap",
  ];
  const supported =
    platform() === "linux" ? [...common, ...linuxPackaged] : common;
  if (targetBrowser === "all") return supported;
  if (targetBrowser === "safari")
    fail(
      "Safari is not supported by this local execution bridge because Safari Web Extensions do not use this Native Messaging API in OpenBrowserAgent.",
    );
  if (!supported.includes(targetBrowser))
    fail(`Unsupported browser target: ${targetBrowser}`);
  return [targetBrowser];
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

function nativeHostRegistryKeys(targetBrowser) {
  if (isFirefox(targetBrowser))
    return [`HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`];
  if (targetBrowser === "edge")
    return [
      `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    ];
  if (targetBrowser === "brave")
    return [
      `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${HOST_NAME}`,
      chromeNativeHostRegistryKey(),
    ];
  if (targetBrowser === "vivaldi")
    return [
      `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${HOST_NAME}`,
      chromeNativeHostRegistryKey(),
    ];
  if (targetBrowser === "chromium")
    return [
      `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
      chromeNativeHostRegistryKey(),
    ];
  return [chromeNativeHostRegistryKey()];
}

function chromeNativeHostRegistryKey() {
  return `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
}

function defaultConfigPath() {
  return join(openBrowserAgentDir(), "local-execution-bridge.config.json");
}

function defaultBridgePath() {
  return join(openBrowserAgentDir(), "local-execution-bridge.mjs");
}

function defaultWrapperPath() {
  return join(
    openBrowserAgentDir(),
    platform() === "win32"
      ? "openbrowseragent-local-execution-bridge.cmd"
      : "openbrowseragent-local-execution-bridge",
  );
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
    const hasInlineValue = inlineValue !== undefined;
    const next = inlineValue ?? values[index + 1];
    const argValue =
      hasInlineValue || (next && !next.startsWith("--")) ? next : true;
    if (!hasInlineValue && argValue !== true) index += 1;
    parsed[key] = argValue;
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

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(message);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  openbrowseragent-local-execution-bridge update [--browser chrome]
  openbrowseragent-local-execution-bridge update --browser chrome --extension-id <id> [install options]

Options:
  --browser <target|all>                     Browser target to update. Default: all
  --extension-id <id>                        Optional explicit install/update fallback

Without --extension-id, update scans known Native Messaging manifest locations and refreshes every installed OpenBrowserAgent local execution bridge it can find.`);
}
