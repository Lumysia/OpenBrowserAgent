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

// Without the debugger a crop is cut from the visible capture. Images here
// are text naming their width: "w=400".
test("without the debugger, ref and region crops come from the visible capture", async (t) => {
  const image = (width: number) =>
    `data:image/jpeg;base64,${Buffer.from(`w=${width}`).toString("base64")}`;
  const state = browser(async () => image(400));
  // The page: a 200x100 CSS px viewport (captured at 2x); e1 sticks out
  // of its right edge, e2 is below it.
  const rects: Record<string, object> = {
    e1: { x: 180, y: 10, width: 40, height: 20 },
    e2: { x: 0, y: 300, width: 40, height: 20 },
  };
  chrome.scripting = {
    executeScript: async ({ args }: { args?: [string, { ref?: string }] }) => [
      {
        result: args && {
          ok: true,
          value: {
            viewport: { width: 200, height: 100 },
            ...(args[1].ref ? { rect: rects[args[1].ref] } : {}),
          },
          refCounter: 2,
          title: "Tab 1",
          url: "https://example.test/1",
        },
      },
    ],
  } as unknown as typeof chrome.scripting;
  const drawn: number[][] = [];
  const globals = globalThis as Record<string, unknown>;
  const saved = [globals.createImageBitmap, globals.OffscreenCanvas];
  t.after(() => {
    [globals.createImageBitmap, globals.OffscreenCanvas] = saved;
  });
  globals.createImageBitmap = async (blob: Blob) => ({
    width: Number((await blob.text()).slice(2)),
    close() {},
  });
  globals.OffscreenCanvas = class {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext() {
      return {
        drawImage: (_image: unknown, ...box: number[]) => drawn.push(box),
      };
    }
    async convertToBlob() {
      return new Blob([`w=${this.width}`]);
    }
  };
  const region = await screenshotTool.execute(
    { region: { x: 10, y: 20, width: 50, height: 30 }, zoom: 2 },
    context(),
  );
  assert.deepEqual(drawn.pop(), [20, 40, 100, 60, 0, 0, 100, 60]);
  assert.match(
    region.text,
    /viewport x=10 y=20, 50x30 CSS px, at 2x\. Image point \(a, b\) is viewport point \(10 \+ a\/2, 20 \+ b\/2\)/,
  );
  assert.equal(region.image?.dataUrl, image(100));
  // An 8px margin, cut at the viewport's edge.
  const element = await screenshotTool.execute({ ref: "e1" }, context());
  assert.deepEqual(drawn.pop(), [344, 4, 56, 72, 0, 0, 28, 36]);
  assert.match(element.text, /viewport x=172 y=2, 28x36 CSS px, at 1x/);
  const hidden = await screenshotTool.execute({ ref: "e2" }, context());
  assert.equal(hidden.isError, true);
  assert.match(
    hidden.text,
    /e2 has no visible box \(viewport 200x100 CSS px\)/,
  );
  assert.deepEqual(state.activated, []);
});
