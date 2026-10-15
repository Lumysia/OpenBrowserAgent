import assert from "node:assert/strict";
import { test } from "node:test";
import { SIDE_PANEL_SHORTCUT } from "../src/shared/config.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";

// The toolbar button: its keyboard shortcut.

test(
  "the toolbar button's shortcut registers",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    try {
      const commands = await session.options.call(() =>
        chrome.commands.getAll(),
      );
      const action = commands.find(
        (command) => command.name === "_execute_action",
      );
      // Chrome leaves the shortcut empty when it refuses the suggested key.
      assert.equal(action?.shortcut, SIDE_PANEL_SHORTCUT.default);
    } finally {
      await session.close();
    }
  },
);
