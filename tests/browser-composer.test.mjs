import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  checkComposer,
  composerFixture,
  typeComposer,
} from "./browser-composer.mjs";
import { composerStatus, installComposerProbe } from "./composer-probe.mjs";
import { reply, toolResults } from "./provider-fixtures.mjs";

const formatted = [
  "## Browser tabs",
  "Found **two tabs** with `manageTabs`. One is *active*; ~~none~~ is incorrect.",
  "- First tab\n- [Second tab](https://example.test/a?x=1&y=2)",
  "> Unicode: 标签 café 😀. Entities: A &amp; B. Escaped: \\*literal\\*.",
  '```json\n{"count":2,"label":"A & B"}\n```',
  "| Tab | State |\n| --- | --- |\n| First | Active |\n| Second | Open |",
].join("\n\n");

const answer = formatted;
test(
  "production composer persists and renders plain and formatted text parts; rejects damaged output",
  { timeout: 180000 },
  async () => {
    const fixture = await composerFixture((request, response) =>
      reply(
        response,
        request.protocol,
        toolResults(request).length
          ? { text: answer }
          : {
              text: "Checking tabs. ",
              calls: [
                {
                  id: "tabs",
                  name: "manageTabs",
                  args: { operation: "list" },
                },
              ],
            },
      ),
    );
    const { browser, page } = fixture;
    try {
      // Match the five-provider harness, which opens options after sidepanel.
      await browser.open(`chrome-extension://${browser.id}/options.html`);
      await checkComposer(page, fixture.config, async (result) => {
        assert.equal(result.answerRendered, true);
        assert.equal(result.textParts, 2);
        assert.equal(result.matchedTextParts, 2);
        assert.equal(result.rawMarkdownMatches, false);
        assert.equal(
          await page.call(async (answer) => {
            const { chats } = await chrome.storage.local.get("chats");
            return chats
              .flatMap((chat) => chat.messages)
              .some((message) =>
                message.parts?.some(
                  (part) => part.type === "text" && part.text === answer,
                ),
              );
          }, answer),
          true,
          "fixture answer must persist byte-for-byte",
        );
        // These controls mutate only this disposable DOM and immediately restore
        // it. They prove that normalization cannot hide absent or incorrect UI.
        const controls = await page.call(async () => {
          const root = document.querySelector(
            ".messages-content > .message:not(.user)",
          );
          const markdown = root.querySelectorAll(
            ".assistant-text > .markdown",
          )[1];
          const results = {};
          const original = markdown.innerHTML;
          markdown.innerHTML = "<p>Truncated answer.</p>";
          results.truncatedRejected = !(await globalThis.__obaComposerProbe())
            .answerRendered;
          markdown.innerHTML = original;

          const clone = markdown.cloneNode(true);
          document.body.append(clone);
          markdown.replaceChildren();
          results.unrelatedBodyTextRejected = !(
            await globalThis.__obaComposerProbe()
          ).answerRendered;
          clone.remove();
          markdown.innerHTML = original;

          const strong = markdown.querySelector("strong");
          strong.replaceWith(document.createTextNode(strong.textContent));
          results.missingFormattingRejected = !(
            await globalThis.__obaComposerProbe()
          ).answerRendered;
          markdown.innerHTML = original;

          markdown
            .querySelector("a")
            .setAttribute("href", "https://example.test/wrong");
          results.wrongLinkRejected = !(await globalThis.__obaComposerProbe())
            .answerRendered;
          markdown.innerHTML = original;

          markdown.style.display = "none";
          results.hiddenAnswerRejected = !(
            await globalThis.__obaComposerProbe()
          ).answerRendered;
          markdown.style.removeProperty("display");

          const parent = markdown.parentNode;
          markdown.remove();
          results.missingPartRejected = !(await globalThis.__obaComposerProbe())
            .answerRendered;
          parent.prepend(markdown);
          results.restoredAccepted = (
            await globalThis.__obaComposerProbe()
          ).answerRendered;
          return results;
        });
        assert.deepEqual(controls, {
          truncatedRejected: true,
          unrelatedBodyTextRejected: true,
          missingFormattingRejected: true,
          wrongLinkRejected: true,
          hiddenAnswerRejected: true,
          missingPartRejected: true,
          restoredAccepted: true,
        });
        const missingStoredTextRejected = await page.call(async () => {
          const { chats } = await chrome.storage.local.get("chats");
          const damaged = structuredClone(chats);
          for (const chat of damaged)
            for (const message of chat.messages)
              if (message.role === "assistant")
                message.parts = message.parts.filter(
                  (part) => part.type !== "text",
                );
          try {
            await chrome.storage.local.set({ chats: damaged });
            const status = await globalThis.__obaComposerProbe();
            return status.textParts === 0 && !status.answerRendered;
          } finally {
            await chrome.storage.local.set({ chats });
          }
        });
        assert.equal(missingStoredTextRejected, true);
        await poll(async () => (await composerStatus(page)).answerRendered);
        // Existing successful responses cannot satisfy a fresh submission check.
        await installComposerProbe(
          page,
          "Use manageTabs with operation=list to list the open tabs, then briefly report the result.",
        );
        const stale = await composerStatus(page);
        assert.equal(stale.freshUserMessages, 0);
        assert.equal(stale.answerRendered, false);
        console.log(
          JSON.stringify({
            fixture: "plain and markdown",
            ...result,
            controls,
            missingStoredTextRejected,
            staleResponseRejected: true,
          }),
        );
        await typeComposer(page, "Composing draft");
        assert.equal(
          await page.call(() => {
            const event = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
              isComposing: true,
            });
            document
              .querySelector(".composer-box textarea")
              .dispatchEvent(event);
            return event.defaultPrevented;
          }),
          false,
          "IME confirmation must remain available to the input method",
        );
        assert.equal(
          await page.call(
            () => document.querySelector(".composer-box textarea").value,
          ),
          "Composing draft",
        );
      });
    } finally {
      await fixture.close();
    }
  },
);
