import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";
import { typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// Settings → Local execution bridges: the install command with this
// extension's ID, and the installer's output pasted to add the bridge.

const OUTPUT = JSON.stringify(
  {
    success: true,
    hostName: "openbrowseragent.local_execution_bridge",
    commandId: "default",
    secret: "s3cret",
    nextExtensionConfig: {
      hostName: "openbrowseragent.local_execution_bridge",
      bridgeKey: "default",
      secret: "s3cret",
    },
  },
  null,
  2,
);

test(
  "a bridge from the installer's output",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    const { browser, extensionUrl } = session;
    try {
      const page = await browser.open(
        extensionUrl(`options.html${OPTIONS_HASH.localExecutionBridges}`),
      );
      const command = await poll(() =>
        page.call(
          () =>
            document.querySelector(".bridge-install-command code")?.textContent,
        ),
      );
      assert.equal(
        command,
        `npx openbrowseragent-local-execution-bridge@1 install --browser chrome --extension-id ${browser.id} --command-id default`,
      );
      await typeText(page, `$ ${command}\n${OUTPUT}\n`, "textarea");
      await page.call(() =>
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent.includes("Add and test"))
          .click(),
      );
      const [bridge] = await poll(async () => {
        const stored = await page.call(
          async (key) => (await chrome.storage.local.get(key))[key],
          STORAGE_KEYS.localExecutionBridges,
        );
        return stored?.length ? stored : null;
      });
      assert.equal(bridge.hostName, "openbrowseragent.local_execution_bridge");
      assert.equal(bridge.bridgeKey, "default");
      assert.equal(bridge.secret, "s3cret");
      // It was tested: no host is installed in the test browser.
      await poll(async () => {
        const [tested] = await page.call(
          async (key) => (await chrome.storage.local.get(key))[key],
          STORAGE_KEYS.localExecutionBridges,
        );
        return !!tested.lastTestError;
      });
    } finally {
      await session.close();
    }
  },
);
