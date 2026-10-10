import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HOST_NAME = "openbrowseragent.local_execution_bridge";
const commonBrowsers = [
  "chrome",
  "edge",
  "brave",
  "vivaldi",
  "chromium",
  "firefox",
  "librewolf",
];
const linuxBrowsers = [
  "firefox-flatpak",
  "chromium-flatpak",
  "brave-flatpak",
  "librewolf-flatpak",
  "firefox-snap",
  "chromium-snap",
  "brave-snap",
];
export const isFirefox = (browser) => /^(firefox|librewolf)(-|$)/.test(browser);
export const stringArg = (value) =>
  typeof value === "string" ? value.trim() : "";
export const shellQuote = (value) =>
  `'${String(value).replaceAll("'", "'\\''")}'`;

export function browsersFor(browser) {
  const supported = [
    ...commonBrowsers,
    ...(platform() === "linux" ? linuxBrowsers : []),
  ];
  if (browser === "all") return supported;
  if (supported.includes(browser)) return [browser];
  throw new Error(
    browser === "safari"
      ? "Safari is not supported by this local execution bridge because Safari Web Extensions do not use this Native Messaging API in OpenBrowserAgent."
      : `Unsupported browser target: ${browser}`,
  );
}

export function nativeHostDir(browser) {
  const home = homedir();
  if (platform() === "win32") {
    if (isFirefox(browser))
      return join(
        process.env.APPDATA || join(home, "AppData", "Roaming"),
        "Mozilla",
        "NativeMessagingHosts",
      );
    const vendor = {
      chrome: "Google/Chrome",
      edge: "Microsoft/Edge",
      brave: "BraveSoftware/Brave-Browser",
      vivaldi: "Vivaldi",
      chromium: "Chromium",
    }[browser];
    return join(
      process.env.LOCALAPPDATA || join(home, "AppData", "Local"),
      vendor,
      "User Data",
      "NativeMessagingHosts",
    );
  }
  if (platform() === "darwin") {
    const vendor = isFirefox(browser)
      ? "Mozilla"
      : {
          chrome: "Google/Chrome",
          edge: "Microsoft Edge",
          brave: "BraveSoftware/Brave-Browser",
          vivaldi: "Vivaldi",
          chromium: "Chromium",
        }[browser];
    return join(
      home,
      "Library",
      "Application Support",
      vendor,
      "NativeMessagingHosts",
    );
  }
  const directories = {
    firefox: ".mozilla/native-messaging-hosts",
    "firefox-flatpak":
      ".var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts",
    "firefox-snap": "snap/firefox/common/.mozilla/native-messaging-hosts",
    librewolf: ".librewolf/native-messaging-hosts",
    "librewolf-flatpak":
      ".var/app/io.gitlab.librewolf-community/.librewolf/native-messaging-hosts",
    chrome: ".config/google-chrome/NativeMessagingHosts",
    chromium: ".config/chromium/NativeMessagingHosts",
    "chromium-flatpak":
      ".var/app/org.chromium.Chromium/config/chromium/NativeMessagingHosts",
    "chromium-snap": "snap/chromium/common/chromium/NativeMessagingHosts",
    edge: ".config/microsoft-edge/NativeMessagingHosts",
    brave: ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
    "brave-flatpak":
      ".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
    "brave-snap":
      "snap/brave/common/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
    vivaldi: ".config/vivaldi/NativeMessagingHosts",
  };
  return join(home, directories[browser]);
}

export function nativeHostRegistryKeys(browser) {
  const prefix = "HKCU\\Software\\";
  const suffix = `\\NativeMessagingHosts\\${HOST_NAME}`;
  const chromeKey = `${prefix}Google\\Chrome${suffix}`;
  if (isFirefox(browser)) return [`${prefix}Mozilla${suffix}`];
  if (browser === "edge") return [`${prefix}Microsoft\\Edge${suffix}`];
  const vendor = {
    brave: "BraveSoftware\\Brave-Browser",
    vivaldi: "Vivaldi",
    chromium: "Chromium",
  }[browser];
  return vendor ? [`${prefix}${vendor}${suffix}`, chromeKey] : [chromeKey];
}

export function openBrowserAgentDir() {
  if (platform() === "win32")
    return join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "OpenBrowserAgent",
    );
  if (platform() === "darwin")
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

export function installPaths(args = {}) {
  const root = openBrowserAgentDir();
  return {
    configPath: resolvePath(
      stringArg(args.config) ||
        join(root, "local-execution-bridge.config.json"),
    ),
    bridgePath: resolvePath(
      stringArg(args.bridge) || join(root, "local-execution-bridge.mjs"),
    ),
    wrapperPath: resolvePath(
      stringArg(args.wrapper) ||
        join(
          root,
          platform() === "win32"
            ? "openbrowseragent-local-execution-bridge.cmd"
            : "openbrowseragent-local-execution-bridge",
        ),
    ),
  };
}

export function installRuntime({ configPath, bridgePath, wrapperPath }) {
  mkdirSync(dirname(bridgePath), { recursive: true });
  copyFileSync(
    fileURLToPath(new URL("./bridge.mjs", import.meta.url)),
    bridgePath,
  );
  if (platform() !== "win32") chmodSync(bridgePath, 0o755);
  const wrapper =
    platform() === "win32"
      ? `@echo off\r\nset "OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=${configPath}"\r\n"${process.execPath}" "${bridgePath}"\r\n`
      : `#!/usr/bin/env sh\nOPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=${shellQuote(configPath)} exec ${shellQuote(process.execPath)} ${shellQuote(bridgePath)}\n`;
  mkdirSync(dirname(wrapperPath), { recursive: true });
  writeFileSync(wrapperPath, wrapper, "utf8");
  if (platform() !== "win32") chmodSync(wrapperPath, 0o755);
}

export function readInstalledPaths(wrapperPath) {
  const text = readFileSync(wrapperPath, "utf8");
  if (platform() === "win32") {
    const configPath = text.match(
      /OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=([^"\r\n]+)/,
    )?.[1];
    const bridgePath = text.match(/^"[^"\r\n]+" "([^"\r\n]+)"\r?$/m)?.[1];
    if (configPath && bridgePath)
      return { wrapperPath, configPath, bridgePath };
  } else {
    // Parse only our generated command, including spaces and apostrophes in
    // paths. Never execute wrapper text to discover installation ownership.
    const quoted = "('(?:[^']|'\\\\'')*')";
    const match = text.match(
      new RegExp(
        `OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG=${quoted} exec ${quoted} ${quoted}`,
      ),
    );
    const unquote = (value) => value.slice(1, -1).replaceAll("'\\''", "'");
    if (match)
      return {
        wrapperPath,
        configPath: unquote(match[1]),
        bridgePath: unquote(match[3]),
      };
  }
  throw new Error(
    `Unrecognized bridge wrapper: ${wrapperPath}. Reinstall with --extension-id.`,
  );
}

export function writeManifest(path, browser, extensionId, wrapperPath) {
  writeJson(path, {
    name: HOST_NAME,
    description: "OpenBrowserAgent local execution bridge",
    path: wrapperPath,
    type: "stdio",
    ...(isFirefox(browser)
      ? { allowed_extensions: [extensionId] }
      : { allowed_origins: [`chrome-extension://${extensionId}/`] }),
  });
  if (platform() !== "win32") return [];
  const keys = nativeHostRegistryKeys(browser);
  for (const key of keys) {
    const result = spawnSync(
      "reg",
      ["add", key, "/ve", "/t", "REG_SZ", "/d", path, "/f"],
      { stdio: "pipe", windowsHide: true },
    );
    if (result.status !== 0)
      throw new Error(
        `Failed to register Native Messaging host for ${browser}: ${String(result.stderr || result.stdout)}`,
      );
  }
  return keys;
}

export function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith("--")) continue;
    const [key, inlineValue] = values[index].slice(2).split(/=(.*)/s, 2);
    const next = inlineValue ?? values[index + 1];
    const value =
      inlineValue !== undefined || (next && !next.startsWith("--"))
        ? next
        : true;
    if (inlineValue === undefined && value !== true) index++;
    parsed[key.trim()] = value;
  }
  return parsed;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
export function resolvePath(path) {
  return resolve(path.startsWith("~") ? join(homedir(), path.slice(1)) : path);
}
