import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { launchExtension, poll } from "./chromium.mjs";
import { configureComposer, submitComposer } from "./browser-composer.mjs";
import { installComposerProbe, composerStatus } from "./composer-probe.mjs";
import { providerFixture, reply, toolResults } from "./provider-fixtures.mjs";

const list = [
  "Found ",
  "tabs:\n",
  "- **First",
  " tab** is *open* with `code`.",
  "\n- [Second",
  " tab](https://example.test/) is also open.",
];
const prose = [
  "Found tabs. ",
  "The first",
  " tab is open.",
  " The second",
  " tab is also open.",
];

for (const mode of ["stream-list", "complete-list", "stream-prose"]) {
  test(
    `production animated Markdown: ${mode} preserves the root, nested tokens and every text part`,
    { timeout: 30000 },
    async () => {
      const chunks = mode === "stream-prose" ? prose : list;
      const fixture = await providerFixture(async (request, response) => {
        if (!toolResults(request).length) {
          reply(response, request.protocol, {
            text: "Checking tabs. ",
            calls: [
              { id: "tabs", name: "manageTabs", args: { operation: "list" } },
            ],
          });
          return;
        }
        if (mode === "complete-list") {
          reply(response, request.protocol, { text: chunks.join("") });
          return;
        }
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const content of chunks) {
          response.write(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`,
          );
          await delay(300);
        }
        response.end(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
        );
      });
      let browser;
      try {
        browser = await launchExtension({
          headed: process.env.OBA_HEADLESS !== "1",
        });
        const page = await browser.open(
          `chrome-extension://${browser.id}/sidepanel.html`,
        );
        await page.send("Page.enable");
        await page.send("Page.addScriptToEvaluateOnNewDocument", {
          source: `
        globalThis.__obaRenderEvidence = { errors: [], animated: false, incremental: false };
        addEventListener("error", event => __obaRenderEvidence.errors.push(event.error?.name || "Error"));
        addEventListener("unhandledrejection", event => __obaRenderEvidence.errors.push(event.reason?.name || "Error"));
        new MutationObserver(() => {
          if (document.querySelector(".markdown .stream-char")) __obaRenderEvidence.animated = true;
          if (document.querySelector(".stop-button") && [...document.querySelectorAll(".markdown")].some(node => node.textContent.includes("Found tabs"))) __obaRenderEvidence.incremental = true;
        }).observe(document, { childList: true, subtree: true, characterData: true });
      `,
        });
        await configureComposer(page, {
          provider: "openai",
          model: "fixture",
          baseUrl: `${fixture.baseUrl}/v1`,
          apiKey: "",
        });
        const prompt =
          "List the tabs using manageTabs and describe the result.";
        await installComposerProbe(page, prompt);
        await submitComposer(page, prompt);
        let status;
        await poll(async () => {
          status = await composerStatus(page);
          return (
            status.answerRendered ||
            (await page.call(() => __obaRenderEvidence.errors.length > 0))
          );
        });
        const evidence = await page.call(() => ({
          ...__obaRenderEvidence,
          rootPresent: document.querySelector("#root")?.childElementCount > 0,
        }));
        assert.deepEqual(
          evidence.errors,
          [],
          "rendering must not throw or unmount the application",
        );
        assert.equal(evidence.rootPresent, true);
        assert.equal(status.answerRendered, true);
        assert.equal(status.matchedTextParts, 2);
        assert.equal(status.completedToolParts, 1);
        if (mode !== "complete-list") {
          assert.equal(
            evidence.animated,
            true,
            "real character animation must remain enabled",
          );
          assert.equal(
            evidence.incremental,
            true,
            "answer text must render before the stream completes",
          );
        }
        assert.equal(
          await page.call(async (answer) => {
            const { chats } = await chrome.storage.local.get("chats");
            return chats.some((chat) =>
              chat.messages.some((message) =>
                message.parts?.some(
                  (part) => part.type === "text" && part.text === answer,
                ),
              ),
            );
          }, chunks.join("")),
          true,
        );
      } finally {
        await browser?.close();
        await fixture.close();
      }
    },
  );
}
