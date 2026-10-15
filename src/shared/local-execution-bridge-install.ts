// Setting up a local execution bridge from the settings page: the installer
// command with this extension's ID filled in, and the fields read back from
// what the installer prints (packages/local-execution-bridge/bin/install.mjs).
import { LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY } from "./local-execution-bridges";
import type { LocalExecutionBridgeConfig } from "./types";

export const LOCAL_EXECUTION_BRIDGE_PACKAGE =
  "openbrowseragent-local-execution-bridge@1";

// The installer's browser targets.
export const LOCAL_EXECUTION_BRIDGE_BROWSERS = [
  "chrome",
  "edge",
  "brave",
  "vivaldi",
  "chromium",
  "firefox",
  "librewolf",
] as const;

export type LocalExecutionBridgeBrowser =
  (typeof LOCAL_EXECUTION_BRIDGE_BROWSERS)[number];

export function localExecutionBridgeInstallCommand(
  browser: LocalExecutionBridgeBrowser,
  extensionId: string,
) {
  return `npx ${LOCAL_EXECUTION_BRIDGE_PACKAGE} install --browser ${browser} --extension-id ${extensionId} --command-id ${LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY}`;
}

// Native Messaging host names: dot-separated lowercase words.
const HOST_NAME_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

export type InstallerFields = Pick<
  LocalExecutionBridgeConfig,
  "hostName" | "bridgeKey" | "secret"
>;

// The bridge fields from the installer's output: its JSON, also pasted with
// text around it. Undefined when the text holds no host name and secret.
export function parseInstallerOutput(
  text: string,
): InstallerFields | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let output: Record<string, unknown>;
  try {
    output = JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!output || typeof output !== "object") return undefined;
  const next =
    output.nextExtensionConfig && typeof output.nextExtensionConfig === "object"
      ? (output.nextExtensionConfig as Record<string, unknown>)
      : {};
  const string = (...values: unknown[]) =>
    values
      .find(
        (value): value is string => typeof value === "string" && !!value.trim(),
      )
      ?.trim();
  const hostName = string(next.hostName, output.hostName);
  const secret = string(next.secret, output.secret);
  const bridgeKey =
    string(next.bridgeKey, output.commandId) ??
    LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY;
  if (!hostName || !HOST_NAME_PATTERN.test(hostName) || !secret)
    return undefined;
  return { hostName, bridgeKey, secret };
}

// The stored bridge the output belongs to (the installer was run again for
// the same host and shell config), if any.
export function bridgeForInstallerFields(
  bridges: LocalExecutionBridgeConfig[],
  fields: InstallerFields,
) {
  return bridges.find(
    (bridge) =>
      bridge.hostName === fields.hostName &&
      (bridge.bridgeKey || LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY) ===
        fields.bridgeKey,
  );
}
