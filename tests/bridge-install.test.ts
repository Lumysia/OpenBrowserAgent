import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test(
  "bridge install/update/uninstall round-trips quoted custom paths and keeps a shared runtime",
  { skip: process.platform !== "linux" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oba-install-"));
    const run = (args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [resolve("packages/local-execution-bridge/bin/cli.mjs"), ...args],
        {
          env: {
            PATH: process.env.PATH,
            HOME: directory,
            XDG_CONFIG_HOME: join(directory, ".config"),
          },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    try {
      const config = join(directory, "quoted ' paths", "librewolf.json");
      const bridge = join(directory, "quoted ' paths", "librewolf.mjs");
      const wrapper = join(directory, "quoted ' paths", "librewolf");
      const custom = [
        "--config",
        config,
        "--bridge",
        bridge,
        "--wrapper",
        wrapper,
      ];
      const installed = run([
        "install",
        "--browser",
        "librewolf",
        "--extension-id",
        "open-browser-agent@openbrowseragent.local",
        "--secret",
        "disposable-fixture",
        ...custom,
      ]);
      const manifestPath = join(
        directory,
        ".librewolf/native-messaging-hosts",
        "openbrowseragent.local_execution_bridge.json",
      );
      assert.equal(installed.manifestPath, manifestPath);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.deepEqual(manifest.allowed_extensions, [
        "open-browser-agent@openbrowseragent.local",
      ]);
      const updated = run(["update", "--browser", "librewolf"]);
      assert.equal(updated.updated[0].bridgePath, bridge);
      assert.equal(updated.updated[0].configPath, config);
      assert.match(await readFile(config, "utf8"), /disposable-fixture/);
      run(["uninstall", "--browser", "librewolf", "--keep-config", ...custom]);
      await access(config);
      await assert.rejects(access(manifestPath));
      await assert.rejects(access(bridge));
      await assert.rejects(access(wrapper));
      const firefox = run([
        "install",
        "--browser",
        "firefox",
        "--extension-id",
        "open-browser-agent@openbrowseragent.local",
        "--secret",
        "disposable-fixture",
      ]);
      const chromium = run([
        "install",
        "--browser",
        "chromium",
        "--extension-id",
        "a".repeat(32),
        "--secret",
        "disposable-fixture",
        "--wrapper",
        join(directory, "other-wrapper"),
      ]);
      const removedFirefox = run(["uninstall", "--browser", "firefox"]);
      assert.ok(removedFirefox.kept.includes(firefox.configPath));
      assert.ok(removedFirefox.kept.includes(firefox.bridgePath));
      await access(chromium.wrapperPath);
      await access(chromium.bridgePath);
      await access(chromium.configPath);
      await assert.rejects(access(firefox.wrapperPath));
      run(["update", "--browser", "chromium"]);
      run([
        "uninstall",
        "--browser",
        "chromium",
        "--wrapper",
        chromium.wrapperPath,
      ]);
      await assert.rejects(access(chromium.configPath));
      await assert.rejects(access(chromium.bridgePath));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
