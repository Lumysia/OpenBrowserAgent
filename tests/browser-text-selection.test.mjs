import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  composerFixture,
  sendComposer,
  typeComposer,
} from "./browser-composer.mjs";
import { reply } from "./provider-fixtures.ts";

// A field people type into, not a radio or switch.
const FIELD = 'input:is([type="text"], [type="number"], :not([type]))';
const ANSWER = "Here is **bold** text.\n\n```js\nconst answer = 42;\n```";

// Computed user-select of the first element matching each selector.
function userSelect(page, selectors) {
  return page.call(
    (selectors) =>
      Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => {
          const element = document.querySelector(selector);
          return [name, element && getComputedStyle(element).userSelect];
        }),
      ),
    selectors,
  );
}

// Interface chrome is not selectable; chat content and fields are.
test(
  "only content and fields are text-selectable",
  { timeout: 120000 },
  async () => {
    const fixture = await composerFixture((request, response) =>
      reply(response, request.protocol, { text: ANSWER }),
    );
    const { page, browser } = fixture;
    try {
      await fixture.configure();
      await poll(() => page.call(() => !!document.querySelector(".empty h2")));
      assert.deepEqual(
        await userSelect(page, {
          heading: ".empty h2",
          subtitle: ".empty p",
          button: ".sidepanel-header button",
          composer: ".composer-box textarea",
        }),
        {
          heading: "none",
          subtitle: "none",
          button: "none",
          composer: "text",
        },
      );

      await typeComposer(page, "Show me the answer.");
      await sendComposer(page);
      await poll(
        () =>
          page.call(
            () =>
              !!document
                .querySelector(".assistant-text .markdown code")
                ?.textContent.includes("42") &&
              !!document.querySelector(".assistant-text .copy-message"),
          ),
        30000,
      );
      assert.deepEqual(
        await userSelect(page, {
          user: ".message.user .ui-user-text",
          markdown: ".assistant-text .markdown strong",
          code: ".assistant-text .markdown pre",
          action: ".assistant-text .copy-message",
          header: ".sidepanel-header button",
        }),
        {
          user: "text",
          markdown: "text",
          code: "text",
          action: "none",
          header: "none",
        },
      );

      // Select all takes the conversation, not the buttons around it.
      await page.call(() => {
        document.activeElement?.blur();
        getSelection().removeAllRanges();
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: 2,
        commands: ["selectAll"],
      });
      const selected = await page.call(() => getSelection().toString());
      assert.match(selected, /Show me the answer\./);
      assert.match(selected, /const answer = 42;/);
      const chrome = await page.call(() =>
        [
          ...document.querySelectorAll(".sidepanel-header, .composer button"),
        ].flatMap((element) =>
          [element.textContent, element.getAttribute("aria-label")]
            .map((text) => text?.trim())
            .filter(Boolean),
        ),
      );
      for (const label of chrome) assert.ok(!selected.includes(label), label);

      const options = await browser.open(
        `chrome-extension://${browser.id}/options.html`,
      );
      await poll(() =>
        options.call(
          (field) =>
            !!document.querySelector("h1") && !!document.querySelector(field),
          FIELD,
        ),
      );
      assert.deepEqual(
        await userSelect(options, {
          heading: "h1",
          label: "label",
          input: FIELD,
        }),
        { heading: "none", label: "none", input: "text" },
      );
      // Typing replaces the field's selected value.
      await options.call((field) => {
        const input = document.querySelector(field);
        input.focus();
        input.select();
      }, FIELD);
      await options.send("Input.insertText", { text: "7" });
      await poll(() =>
        options.call(
          (field) => document.querySelector(field).value === "7",
          FIELD,
        ),
      );
    } finally {
      await fixture.close();
    }
  },
);
