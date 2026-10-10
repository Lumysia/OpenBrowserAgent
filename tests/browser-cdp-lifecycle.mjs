import assert from "node:assert/strict";
import { poll } from "./chromium.mjs";

export async function checkCdpLifecycle(t, fixture, tab) {
  const { page } = fixture;
  const load = (names) => ({ name: "loadTools", args: { names } });
  const evaluate = (selector, fn) => ({
    name: "cdpEvaluateScript",
    args: { ...selector, function: fn },
  });
  const cdp = (selector, args) => ({
    name: "cdpPage",
    args: { ...selector, ...args },
  });
  const outputs = (results) => {
    for (const result of results)
      assert.equal(
        result.output.error,
        undefined,
        `${result.name}: ${result.output.error}`,
      );
    return results.map((result) => result.output);
  };

  await t.test(
    "explicit target attachment shares emulation with its tab alias across navigation and reset",
    async () => {
      const target = await page.call(
        async (tabId) =>
          (await chrome.debugger.getTargets()).find(
            (target) => target.tabId === tabId,
          ),
        tab.id,
      );
      assert.ok(target?.id);
      const result = outputs(
        await fixture.run([
          load(["cdpPage", "cdpEvaluateScript"]),
          cdp(
            { targetId: target.id },
            {
              operation: "emulate",
              viewport: "411x731x2",
              colorScheme: "dark",
            },
          ),
          evaluate(
            { tabId: tab.id },
            "()=>({width:innerWidth,dpr:devicePixelRatio})",
          ),
          cdp(
            { tabId: tab.id },
            { operation: "navigate", url: `${fixture.baseUrl}/page` },
          ),
          evaluate(
            { targetId: target.id },
            "()=>({width:innerWidth,dpr:devicePixelRatio})",
          ),
          cdp({ tabId: tab.id }, { operation: "emulate", reset: true }),
          evaluate(
            { targetId: target.id },
            "()=>({width:innerWidth,dpr:devicePixelRatio})",
          ),
        ]),
      );
      assert.deepEqual(result[2].result, { width: 411, dpr: 2 });
      assert.deepEqual(result[4].result, { width: 411, dpr: 2 });
      assert.notEqual(result[6].result.width, 411);
      assert.equal(result[6].result.dpr, 1);
      assert.equal(
        await page.call(
          async (id) =>
            (await chrome.debugger.getTargets()).find(
              (target) => target.id === id,
            )?.attached,
          target.id,
        ),
        false,
      );
    },
  );

  await t.test(
    "dangerous script executes in its named isolated world without leaking into the main world",
    async () => {
      const result = outputs(
        await fixture.run([
          load(["cdpExecuteArbitraryJavaScript", "cdpEvaluateScript"]),
          {
            name: "cdpExecuteArbitraryJavaScript",
            args: {
              targetId: (
                await page.call(
                  async (id) =>
                    (await chrome.debugger.getTargets()).find(
                      (target) => target.tabId === id,
                    ),
                  tab.id,
                )
              ).id,
              world: "ISOLATED",
              code: "globalThis.obaFixtureWorld = 42",
            },
          },
          evaluate({ tabId: tab.id }, "()=>typeof globalThis.obaFixtureWorld"),
        ]),
      );
      assert.equal(result[1].success, true);
      assert.equal(result[2].result, "undefined");
    },
  );

  await t.test(
    "disabled dangerous-script capability prevents page mutation in the production Pi loop",
    async () => {
      await fixture.run(
        [
          load(["cdpExecuteArbitraryJavaScript"]),
          {
            name: "cdpExecuteArbitraryJavaScript",
            args: {
              tabId: tab.id,
              code: "document.body.dataset.obaDangerousEffect = 'executed'",
            },
          },
        ],
        { javascriptExecution: false },
      );
      assert.equal(fixture.requests.length, 3);
      assert.ok(
        fixture.requests
          .at(-1)
          .messages.some(
            (message) =>
              message.role === "tool" &&
              /Tool cdpExecuteArbitraryJavaScript not found/.test(
                JSON.stringify(message.content),
              ),
          ),
      );
      const effect = await page.call(
        async (tabId) =>
          (
            await chrome.scripting.executeScript({
              target: { tabId },
              func: () => document.body.dataset.obaDangerousEffect || null,
            })
          )[0].result,
        tab.id,
      );
      assert.equal(effect, null);
      assert.equal(
        await page.call(
          async (id) =>
            (await chrome.debugger.getTargets()).find(
              (target) => target.tabId === id,
            )?.attached,
          tab.id,
        ),
        false,
      );
    },
  );

  await t.test(
    "a real target-only hidden page supports evaluation, retained emulation and close",
    async () => {
      const { targetId } = await fixture.browser.browser.send(
        "Target.createTarget",
        { url: `${fixture.baseUrl}/page`, hidden: true, background: true },
      );
      try {
        const target = await poll(() =>
          page.call(
            async (id) =>
              (await chrome.debugger.getTargets()).find(
                (target) => target.id === id,
              ),
            targetId,
          ),
        );
        assert.equal(target.tabId, undefined);
        const result = outputs(
          await fixture.run([
            load(["cdpPage", "cdpEvaluateScript"]),
            cdp({ targetId }, { operation: "emulate", viewport: "421x741x2" }),
            evaluate(
              { targetId },
              "()=>({width:innerWidth,dpr:devicePixelRatio})",
            ),
            cdp({ targetId }, { operation: "emulate", reset: true }),
            cdp({ targetId }, { operation: "close" }),
          ]),
        );
        assert.deepEqual(result[2].result, { width: 421, dpr: 2 });
        assert.equal(result[4].success, true);
        await poll(() =>
          page.call(
            async (id) =>
              !(await chrome.debugger.getTargets()).some(
                (target) => target.id === id,
              ),
            targetId,
          ),
        );
        console.log(
          "Actual hidden Chromium page had no tabId; explicit target evaluation/emulation/reset/close passed.",
        );
      } finally {
        await fixture.browser.browser
          .send("Target.closeTarget", { targetId })
          .catch(() => {});
      }
    },
  );
}
