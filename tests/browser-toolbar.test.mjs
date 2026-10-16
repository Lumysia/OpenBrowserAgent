import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_COMMAND, SIDE_PANEL_COMMAND } from "../src/shared/commands.ts";
import { SIDE_PANEL_SHORTCUT } from "../src/shared/config.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";

// The toolbar button and the side panel's keyboard shortcut.

test(
  "the side panel's shortcut registers; the toolbar button has none",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    try {
      const commands = await session.options.call(() =>
        chrome.commands.getAll(),
      );
      const shortcut = (name) =>
        commands.find((command) => command.name === name)?.shortcut;
      // Chrome leaves the shortcut empty when it refuses the suggested key.
      assert.equal(shortcut(SIDE_PANEL_COMMAND), SIDE_PANEL_SHORTCUT.default);
      assert.equal(shortcut(ACTION_COMMAND), "");
    } finally {
      await session.close();
    }
  },
);
