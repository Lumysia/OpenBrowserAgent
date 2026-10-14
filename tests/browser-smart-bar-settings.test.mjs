import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import {
  barHas,
  barState,
  click,
  clickInBar,
  inSmartBar,
  pressKey,
  resultText,
  selectInFrame,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// When the bar shows: off by default, turned on in the options page, site
// rules, trigger modes, the × menu and the hand-off to the side panel.
const PAGE = `<!doctype html><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p,textarea{display:block;width:420px;margin:0 0 24px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>
<textarea id="area" rows="2">hello wrold</textarea>
<iframe id="frame" style="height:60px"></iframe>
<canvas id="canvas" width="420" height="40" style="display:block"></canvas>
<div id="proxy" contenteditable style="position:fixed;left:-10000px;top:0">Text the page draws on its canvas.</div>
<script>
  // An editor that draws its text on a canvas and keeps the selected text
  // in a hidden copy, as canvas-based document editors do.
  canvas.addEventListener("mouseup", () => {
    const range = document.createRange();
    range.selectNodeContents(proxy);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  // A cross-origin embed; it reports whether the bar's UI was let in.
  window.frameBar = false;
  frame.src = location.href.replace("127.0.0.1", "localhost") + "/frame";
  addEventListener("message", (event) => {
    if (!event.data || !("bar" in event.data)) return;
    window.frameReady = true;
    window.frameBar = event.data.bar;
  });
</script>`;

// The bar's host is added next to <head> and <body>.
const FRAME = `<!doctype html><p id="framed" style="font:16px sans-serif">Text in an embedded frame.</p>
<script>setInterval(() => parent.postMessage({ bar: document.documentElement.childElementCount > 2 }, "*"), 100);</script>`;

test("smart bar settings", { timeout: 240000 }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE, "/page/frame": FRAME, "/away": "<p>Away</p>" },
    answer: async (_prompt, write) => write("Streamed explanation finished."),
  });
  const { browser, options, extensionUrl, url, updateSmartBar } = session;
  const listedUrl = url("/page", "localhost");
  let listed;
  try {
    const page = await browser.open(url("/page"));

    await t.test("off by default: no bar on selection", async () => {
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
      // Zero cost while off: no page script is registered at all.
      assert.deepEqual(
        await options.call(() =>
          chrome.scripting.getRegisteredContentScripts(),
        ),
        [],
      );
    });

    await t.test("turned on in the options page, the bar shows", async () => {
      await options.send("Page.navigate", {
        url: extensionUrl("options.html#/smart-bar"),
      });
      const enable = await poll(() =>
        options.call(() => {
          const label = [...document.querySelectorAll("label")].find(
            (item) => item.textContent === "Show the smart bar",
          );
          const button = label && document.getElementById(label.htmlFor);
          if (!button) return undefined;
          const rect = button.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }),
      );
      await click(options, enable);
      // The page was open before: the background injects the page script.
      await poll(async () => {
        await selectText(page, "#text");
        return (await barState(page)) === "toolbar";
      });
    });

    await t.test("no bar where every action is turned off", async () => {
      await updateSmartBar({
        disabledPageActions: ["ask", "explain", "translate", "search", "copy"],
      });
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
      // Text fields have their own actions.
      await selectText(page, "#area");
      await poll(async () => (await barState(page)) === "toolbar");
      await updateSmartBar({ disabledPageActions: [] });
    });

    await t.test(
      "a page back from the back/forward cache asks again",
      async () => {
        // Shortcut mode: the page script learns not to ask on mouseup.
        await updateSmartBar({ trigger: "shortcut" });
        await selectText(page, "#text");
        await delay(600);
        assert.equal(await barState(page), "none");
        await page.call(() => (window.kept = true));
        await page.send("Page.navigate", { url: url("/away") });
        await poll(() => page.call(() => location.pathname === "/away"));
        // Switched back while the page sits in the cache, missing the news.
        await updateSmartBar({ trigger: "selection" });
        await delay(300);
        const { currentIndex, entries } = await page.send(
          "Page.getNavigationHistory",
        );
        await page.send("Page.navigateToHistoryEntry", {
          entryId: entries[currentIndex - 1].id,
        });
        await poll(() => page.call(() => window.kept === true));
        await selectText(page, "#text");
        await poll(async () => (await barState(page)) === "toolbar");
      },
    );

    await t.test("Esc closes the open menu first, then the bar", async () => {
      const menuOpen = () =>
        barHas(page, ".smart-bar-menu-item", "Turn off smart bar");
      await selectText(page, "#text");
      await poll(async () => (await barState(page)) === "toolbar");
      await clickInBar(page, '[aria-label="Smart bar options"]');
      await poll(menuOpen);
      await pressKey(page, "Escape", "Escape", 27);
      await poll(async () => !(await menuOpen()));
      assert.equal(await barState(page), "toolbar");
      await pressKey(page, "Escape", "Escape", 27);
      await poll(async () => (await barState(page)) === "none");
    });

    await t.test(
      "The close menu highlights only what the pointer is on",
      async () => {
        // Each item's highlight state, read from what the user sees.
        const highlighted = () =>
          inSmartBar(page, (root) =>
            [...root.querySelectorAll(".smart-bar-menu-item")].map(
              (item) => getComputedStyle(item).backgroundColor,
            ),
          );
        const itemPoint = (index) =>
          inSmartBar(
            page,
            (root, index) => {
              const rect = root
                .querySelectorAll(".smart-bar-menu-item")
                [index].getBoundingClientRect();
              return {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
              };
            },
            index,
          );
        const move = async ({ x, y }) =>
          page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await selectText(page, "#text");
        await poll(async () => (await barState(page)) === "toolbar");
        await clickInBar(page, '[aria-label="Smart bar options"]');
        await poll(() =>
          barHas(page, ".smart-bar-menu-item", "Turn off smart bar"),
        );
        await delay(200);
        const [first, second] = await highlighted();
        assert.equal(first, second, "no item is highlighted on open");
        const plain = first;

        await move(await itemPoint(1));
        await poll(async () => {
          const [a, b] = await highlighted();
          return a === plain && b !== plain;
        });
        await move(await itemPoint(0));
        await poll(async () => {
          const [a, b] = await highlighted();
          return a !== plain && b === plain;
        });

        await pressKey(page, "ArrowDown", "ArrowDown", 40);
        await poll(async () => {
          const [a, b] = await highlighted();
          return a === plain && b !== plain;
        });
        await pressKey(page, "Escape", "Escape", 27);
        await pressKey(page, "Escape", "Escape", 27);
        await poll(async () => (await barState(page)) === "none");
      },
    );

    await t.test("text the page doesn't show gets no bar", async () => {
      await selectText(page, "#canvas");
      await delay(600);
      assert.equal(
        await page.call(() => getSelection().toString()),
        "Text the page draws on its canvas.",
      );
      assert.equal(await barState(page), "none");
    });

    await t.test("Hide on this site stops it", async () => {
      await selectText(page, "#text");
      await poll(async () => (await barState(page)) === "toolbar");
      await clickInBar(page, '[aria-label="Smart bar options"]');
      await clickInBar(page, ".smart-bar-menu-item");
      await poll(async () => (await barState(page)) === "none");
      await poll(
        async () =>
          (await session.smartBarSettings()).blockedHosts.join() ===
          "127.0.0.1",
      );
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("a blocked site's embeds get no bar", async () => {
      await page.send("Page.reload");
      await poll(() => page.call(() => window.frameReady));
      await selectInFrame(page, "#frame");
      await delay(1000);
      assert.equal(await page.call(() => window.frameBar), false);
    });

    await t.test("allow-list mode shows only on listed sites", async () => {
      await updateSmartBar({
        siteMode: "allowList",
        allowedHosts: ["localhost"],
      });
      listed = await browser.open(listedUrl);
      await poll(async () => {
        await selectText(listed, "#text");
        return (await barState(listed)) === "toolbar";
      });
      // Frames of a listed site get the bar too.
      await poll(() => listed.call(() => window.frameReady));
      await selectInFrame(listed, "#frame");
      await poll(() => listed.call(() => window.frameBar));
      await page.send("Page.reload");
      await poll(() => page.call(() => document.readyState === "complete"));
      await selectText(page, "#text");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("Ask and Continue hand off to the side panel", async () => {
      await selectText(listed, "#text");
      await clickInBar(listed, '[aria-label="Ask in side panel"]');
      // The click's user gesture opens the window's real side panel.
      const panel = await browser.attach(
        (url) => url === extensionUrl("sidepanel.html"),
      );
      // The selection is a card next to the page's; the composer stays empty.
      await poll(() =>
        panel.call(() =>
          [...document.querySelectorAll(".context-strip .context-card")].some(
            (card) =>
              card.querySelector("strong")?.title ===
              "The quick brown fox jumps over the lazy dog.",
          ),
        ),
      );
      assert.equal(
        await panel.call(
          () => document.querySelector(".composer-box textarea").value,
        ),
        "",
      );
      await selectText(listed, "#text");
      await clickInBar(listed, '[aria-label="Explain"]');
      await poll(async () => (await resultText(listed)).includes("finished."));
      await clickInBar(listed, '[aria-label="Continue in side panel"]');
      await poll(() =>
        panel.call(() =>
          document
            .querySelector(".messages-content")
            ?.textContent?.includes("Streamed explanation finished."),
        ),
      );
    });

    await t.test("shortcut mode shows the bar only on command", async () => {
      await updateSmartBar({ trigger: "shortcut" });
      const prepares = await session.prepares();
      await selectText(listed, "#text");
      await delay(600);
      assert.equal(await barState(listed), "none");
      // The page script knows; it doesn't ask the background on mouseup.
      assert.equal(await session.prepares(), prepares);
      await showForSelection(options, listedUrl);
      await poll(async () => (await barState(listed)) === "toolbar");
      assert.equal(
        await inSmartBar(listed, (root) => root.activeElement?.ariaLabel),
        "Ask in side panel",
      );
      // In a field, Esc hands the keyboard user's focus and selection back.
      await pressKey(listed, "Escape", "Escape", 27);
      await selectText(listed, "#area");
      const field = () =>
        listed.call(() => {
          const area = document.getElementById("area");
          return [document.activeElement === area, area.selectionEnd > 0];
        });
      assert.deepEqual(await field(), [true, true]);
      await showForSelection(options, listedUrl);
      await poll(async () => (await barState(listed)) === "toolbar");
      assert.deepEqual(await field(), [false, true]);
      await pressKey(listed, "Escape", "Escape", 27);
      await poll(async () => (await barState(listed)) === "none");
      assert.deepEqual(await field(), [true, true]);
    });

    await t.test("turned off from the bar, open tabs go quiet", async () => {
      await updateSmartBar({ trigger: "selection" });
      await poll(async () => {
        await selectText(listed, "#text");
        return (await barState(listed)) === "toolbar";
      });
      await clickInBar(listed, '[aria-label="Smart bar options"]');
      await clickInBar(listed, ".smart-bar-menu-item", "Turn off smart bar");
      await poll(
        async () => (await session.smartBarSettings()).enabled === false,
      );
      await delay(300);
      const prepares = await session.prepares();
      assert.ok(prepares > 0);
      for (let i = 0; i < 2; i++) {
        await selectText(listed, "#text");
        await delay(300);
        assert.equal(await barState(listed), "none");
      }
      assert.equal(await session.prepares(), prepares);
    });

    await t.test("model choices live on the providers page", async () => {
      const pickers = (route) =>
        options
          .send("Page.navigate", { url: extensionUrl(`options.html#${route}`) })
          .then(() => delay(800))
          .then(() =>
            options.call(() =>
              [...document.querySelectorAll("[aria-label]")]
                .map((item) => item.getAttribute("aria-label"))
                .filter((label) => /^(Smart bar|Helper) model$/.test(label)),
            ),
          );
      assert.deepEqual(await pickers("/providers"), [
        "Helper model",
        "Smart bar model",
      ]);
      assert.deepEqual(await pickers("/smart-bar"), []);
      assert.deepEqual(await pickers("/"), []);
    });
  } finally {
    await session.close();
  }
});

// What the background sends for the keyboard command.
function showForSelection(options, url) {
  return options.call(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.tabs.sendMessage(tab.id, {
      type: "smart-bar:show-for-selection",
    });
  }, url);
}
