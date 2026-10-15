import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  bridgeForInstallerFields,
  localExecutionBridgeInstallCommand,
  parseInstallerOutput,
} from "../src/shared/local-execution-bridge-install";
import {
  createLocalExecutionBridgeDraft,
  LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME,
} from "../src/shared/local-execution-bridges";

test("the install command has the extension's ID and the browser", () => {
  assert.equal(
    localExecutionBridgeInstallCommand(
      "edge",
      "abcdefghijklmnopabcdefghijklmnop",
    ),
    "npx openbrowseragent-local-execution-bridge@1 install --browser edge --extension-id abcdefghijklmnopabcdefghijklmnop --command-id default",
  );
});

test(
  "the installer's real output fills the bridge fields",
  { skip: process.platform !== "linux" },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "oba-installer-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          resolve("packages/local-execution-bridge/bin/cli.mjs"),
          "install",
          "--browser",
          "chrome",
          "--extension-id",
          "abcdefghijklmnopabcdefghijklmnop",
          "--command-id",
          "work",
        ],
        {
          env: {
            PATH: process.env.PATH,
            HOME: home,
            XDG_CONFIG_HOME: join(home, ".config"),
          },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const printed = JSON.parse(result.stdout);
      // Pasted with the terminal's prompt and command around it.
      const fields = parseInstallerOutput(
        `$ npx … install\n${result.stdout}\n$ `,
      );
      assert.deepEqual(fields, {
        hostName: LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME,
        bridgeKey: "work",
        secret: printed.secret,
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);

test("output without a host name and secret is refused", () => {
  assert.equal(parseInstallerOutput("command not found: npx"), undefined);
  assert.equal(parseInstallerOutput('{"success": true}'), undefined);
  assert.equal(
    parseInstallerOutput('{"hostName": "Not A Host!", "secret": "x"}'),
    undefined,
  );
  // An older output without nextExtensionConfig: the top-level fields.
  assert.deepEqual(parseInstallerOutput('{"hostName": "a.b", "secret": "s"}'), {
    hostName: "a.b",
    bridgeKey: "default",
    secret: "s",
  });
});

test("running the installer again updates the same bridge", () => {
  const bridge = createLocalExecutionBridgeDraft("Mine", {
    hostName: "a.b",
    bridgeKey: "",
  });
  const fields = { hostName: "a.b", bridgeKey: "default", secret: "new" };
  assert.equal(bridgeForInstallerFields([bridge], fields), bridge);
  assert.equal(
    bridgeForInstallerFields([bridge], { ...fields, bridgeKey: "work" }),
    undefined,
  );
});
