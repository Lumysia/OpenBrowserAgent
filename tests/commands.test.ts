import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTION_COMMANDS,
  COMMAND_TITLES,
  commandTitle,
  MANIFEST_COMMANDS,
  SIDE_PANEL_COMMAND,
  suggestedSidePanelKeys,
} from "../src/shared/commands";
import { SIDE_PANEL_SHORTCUT } from "../src/shared/config";
import { ALL_MESSAGES, getMessages } from "../src/shared/i18n";

test("every command in the manifest has a title in every UI language", () => {
  for (const name of [...Object.keys(MANIFEST_COMMANDS), ...ACTION_COMMANDS]) {
    const key = COMMAND_TITLES[name];
    assert.ok(key, name);
    for (const messages of ALL_MESSAGES)
      assert.ok(messages.settings[key].trim(), `${name}: ${key}`);
  }
});

test("command titles follow the UI language, not the browser's description", () => {
  const zh = getMessages("zh-CN");
  for (const name of Object.keys(MANIFEST_COMMANDS))
    assert.equal(
      commandTitle({ name, description: "In the browser's language" }, zh),
      zh.settings[COMMAND_TITLES[name]],
    );
  // A command the table doesn't know keeps the browser's description.
  assert.equal(
    commandTitle({ name: "other", description: "Other" }, zh),
    "Other",
  );
  assert.equal(commandTitle({ name: "other", description: "" }, zh), "other");
});

test("the side panel's command has the side panel's keys; the toolbar button none", () => {
  assert.deepEqual(MANIFEST_COMMANDS[SIDE_PANEL_COMMAND].suggested_key, {
    ...SIDE_PANEL_SHORTCUT,
  });
  for (const name of ACTION_COMMANDS)
    assert.equal(
      (MANIFEST_COMMANDS as Record<string, { suggested_key?: unknown }>)[name]
        ?.suggested_key,
      undefined,
    );
});

test("the side panel's hint suggests the keys of the platform", () => {
  assert.equal(suggestedSidePanelKeys("MacIntel"), SIDE_PANEL_SHORTCUT.mac);
  assert.equal(suggestedSidePanelKeys("Win32"), SIDE_PANEL_SHORTCUT.default);
  assert.equal(
    suggestedSidePanelKeys("Linux x86_64"),
    SIDE_PANEL_SHORTCUT.default,
  );
});
