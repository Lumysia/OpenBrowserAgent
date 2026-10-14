import assert from "node:assert/strict";
import { test } from "node:test";
import { createRunTab } from "../src/background/run-tab";
import { screenshotTool } from "../src/background/tools/screenshot";
import type { ToolContext } from "../src/background/tools/types";
import { fakeTabs, installChrome } from "./fake-chrome";

// A browser without the debugger: tab 1 is the agent's, tab 2 the user's.
function browser(captureTab?: (tabId: number) => Promise<string>) {
  const tabs = fakeTabs(
    [1, 2].map((id) => ({
      id,
      windowId: 7,
      title: `Tab ${id}`,
      url: `https://example.test/${id}`,
    })),
    2,
  );
  const state = Object.assign(tabs.state, {
    activated: [] as number[],
    captured: [] as number[],
  });
  installChrome({
    tabs: {
      ...tabs.api,
      update: async (id: number, props: chrome.tabs.UpdateProperties) => {
        state.activated.push(id);
        return tabs.api.update(id, props);
      },
      captureVisibleTab: async () => {
        state.captured.push(state.active!);
        return "data:image/jpeg;base64,AA==";
      },
      ...(captureTab ? { captureTab } : {}),
    },
  });
  return state;
}

const context = () =>
  ({
    run: { tab: createRunTab("chat", { id: 1 }) },
    toolCallId: "call",
    progress() {},
  }) as unknown as ToolContext;

test("a browser that captures background tabs leaves the user's tab in front", async () => {
  const captured: number[] = [];
  const state = browser(async (tabId) => {
    captured.push(tabId);
    return "data:image/jpeg;base64,AA==";
  });
  const result = await screenshotTool.execute({}, context());
  assert.deepEqual(captured, [1]);
  assert.deepEqual(state.activated, []);
  assert.match(result.text, /^Screenshot of tab 1 \(Tab 1\) attached\.$/);
});

test("a browser that captures only the front tab shows it, then puts the user's tab back", async () => {
  const state = browser();
  const result = await screenshotTool.execute({}, context());
  assert.deepEqual(state.captured, [1]);
  assert.deepEqual(state.activated, [1, 2]);
  assert.equal(state.active, 2);
  assert.match(
    result.text,
    /shown for a moment and the user's tab was put back/,
  );
});
