import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { executeCdpTool } from "../src/background/cdp-tools";
import { BROWSER_TOOL_NAME } from "../src/shared/browser-tools";
import { cdpFixture } from "./cdp-fixture";

afterEach(() => mock.restoreAll());

for (const [type, currentIndex, expectedId] of [
  ["back", 1, 11],
  ["forward", 1, 33],
  ["back", 0, undefined],
  ["forward", 2, undefined],
] as const) {
  test(`CDP ${type} at history index ${currentIndex} uses real history entries and releases the target`, async () => {
    const fixture = cdpFixture();
    const commands = fixture.calls;
    mock.method(
      chrome.debugger,
      "sendCommand",
      async (_target: unknown, method: string, params: unknown) => {
        commands.push({ method, params });
        if (method === "Page.getNavigationHistory")
          return { currentIndex, entries: [11, 22, 33].map((id) => ({ id })) };
        if (method === "Page.navigateToHistoryEntry") return {};
        throw new Error(`Unsupported CDP command: ${method}`);
      },
    );
    const result = (await executeCdpTool(BROWSER_TOOL_NAME.cdpPage, {
      operation: "navigate",
      type,
      targetId: `target-${fixture.tabId}`,
    })) as { success: boolean };
    assert.equal(result.success, expectedId !== undefined);
    assert.deepEqual(commands, [
      { method: "Page.getNavigationHistory", params: undefined },
      ...(expectedId === undefined
        ? []
        : [
            {
              method: "Page.navigateToHistoryEntry",
              params: { entryId: expectedId },
            },
          ]),
    ]);
    assert.equal(fixture.detached.length, 1);
  });
}
