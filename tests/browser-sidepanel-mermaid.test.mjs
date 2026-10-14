import assert from "node:assert/strict";
import { test } from "node:test";
import { sendComposer, typeComposer } from "./browser-composer.mjs";
import { poll } from "./chromium.mjs";
import { startSmartBar } from "./smart-bar-page.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { getMessages } from "../src/shared/i18n.ts";

const t = getMessages("en-US");

// Hosts that used to draw diagrams remotely, and one a diagram names itself.
const BLOCKED = ["*://mermaid.ink/*", "*://mermaid.live/*", "*://leak.test/*"];

// A diagram whose directives and styles try to load from another host: the
// panel's theme stays locked and the drawing is an <img>, which loads nothing.
const DIAGRAM = [
  "```mermaid",
  '%%{init: {"themeCSS": ".node rect { fill: url(https://leak.test/css) }", "fontFamily": "x; background: url(https://leak.test/font)"}}%%',
  "flowchart LR",
  "  A[Start] --> B[Done]",
  "  classDef leak stroke:#f00",
  "  class A leak",
  '  click B href "https://leak.test/click"',
  "```",
].join("\n");
const BROKEN = ["```mermaid", "flowchart LR", "  A -->", "```"].join("\n");

test(
  "Mermaid diagrams are drawn in the side panel without the network",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startSmartBar({
      pages: {},
      answer: async (_prompt, write) =>
        write(`Here it is.\n\n${DIAGRAM}\n\nAnd a broken one:\n\n${BROKEN}\n`),
    });
    const { browser, extensionUrl, fixture } = session;
    try {
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      const requests = [];
      panel.on("Network.requestWillBeSent", ({ request }) =>
        requests.push(request.url),
      );
      await panel.send("Network.enable");
      await panel.send("Network.setBlockedURLs", { urls: BLOCKED });
      await poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );
      await typeComposer(panel, "Draw a diagram");
      await sendComposer(panel);

      const drawn = await poll(() =>
        panel.call(() => {
          const image = document.querySelector(".mermaid-preview img");
          if (!image?.complete || !image.naturalWidth) return undefined;
          return { src: image.src.slice(0, 26), width: image.naturalWidth };
        }),
      );
      assert.equal(drawn.src, "data:image/svg+xml;charset");
      assert.ok(drawn.width > 0);

      const fallback = await poll(() =>
        panel.call(
          (message) =>
            [...document.querySelectorAll(".mermaid-preview-panel")]
              .find((panel) => panel.textContent.includes(message))
              ?.querySelector("pre")?.textContent,
          t.sidepanel.mermaidRenderFailed,
        ),
      );
      assert.match(fallback, /A -->/);

      const outside = requests.filter(
        (url) => /^https?:/.test(url) && !url.startsWith(fixture.baseUrl),
      );
      assert.deepEqual(outside, []);
    } finally {
      await session.close();
    }
  },
);
