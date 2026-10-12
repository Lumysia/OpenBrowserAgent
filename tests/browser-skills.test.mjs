import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  composerFixture,
  sendComposer,
  typeComposer,
} from "./browser-composer.mjs";
import { reply } from "./provider-fixtures.mjs";

// The chat request, not the one for the chat title.
async function chatRequest(fixture) {
  const find = () =>
    fixture.requests
      .map((request) => JSON.stringify(request.body))
      .find((body) => body.includes("<message>"));
  await poll(() => !!find(), 30000);
  return find();
}

// The "/" skill picker in the real side panel: typing "/" lists skills,
// typing filters them, the keyboard picks one, and the picked skill's
// instructions go to the model with the request typed after it.
test(
  "the / picker picks a skill for the request",
  { timeout: 120000 },
  async () => {
    const fixture = await composerFixture((request, response) =>
      reply(response, request.protocol, { text: "Done." }),
    );
    const { page } = fixture;
    const key = (name, code = name) =>
      ["keyDown", "keyUp"].reduce(
        (sent, type) =>
          sent.then(() =>
            page.send("Input.dispatchKeyEvent", { type, key: name, code }),
          ),
        Promise.resolve(),
      );
    const options = () =>
      page.call(() =>
        [...document.querySelectorAll("#slash-skill-picker [role=option]")].map(
          (option) => ({
            name: option.querySelector("strong")?.textContent,
            active: option.getAttribute("aria-selected") === "true",
          }),
        ),
      );
    try {
      await fixture.configure();
      await typeComposer(page, "/");
      await poll(async () => (await options()).length >= 2);
      await page.send("Input.insertText", { text: "bridge" });
      // Names match before descriptions.
      await poll(async () => {
        const shown = await options();
        return (
          shown.length >= 1 &&
          shown.length < 5 &&
          shown[0].name === "local-execution-bridge-setup"
        );
      });
      await page.call(() => {
        const box = document.querySelector(".composer-box textarea");
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      });
      // Back to the full list, then move down to the second skill.
      await page.call(() => {
        const box = document.querySelector(".composer-box textarea");
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        ).set;
        setter.call(box, "/");
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await poll(async () => (await options()).length >= 2);
      const listed = await options();
      assert.equal(listed[0].active, true);
      await key("ArrowDown");
      await poll(async () => (await options())[1]?.active === true);
      const picked = listed[1].name;
      await key("Enter");
      await poll(() =>
        page.call(
          (name) =>
            !document.querySelector("#slash-skill-picker") &&
            document.querySelector(".composer-box textarea").value === "" &&
            [...document.querySelectorAll(".context-card strong")].some(
              (item) => item.textContent === name,
            ),
          picked,
        ),
      );
      await typeComposer(page, "Help me with this.");
      await sendComposer(page);
      const sent = await chatRequest(fixture);
      assert.match(sent, new RegExp(`<skill name=\\\\"${picked}\\\\">`));
      assert.match(sent, /picked this skill for this request/);
      assert.match(sent, /Help me with this\./);
      // The chip is gone after sending and the message shows the skill.
      await poll(() =>
        page.call(
          (name) =>
            ![...document.querySelectorAll(".context-card strong")].some(
              (item) => item.textContent === name,
            ) &&
            [...document.querySelectorAll(".message .message-label")].some(
              (item) => item.textContent.includes(name),
            ),
          picked,
        ),
      );
    } finally {
      await fixture.close();
    }
  },
);

test(
  "typing /name and a request picks the named skill",
  { timeout: 120000 },
  async () => {
    const fixture = await composerFixture((request, response) =>
      reply(response, request.protocol, { text: "Done." }),
    );
    const { page } = fixture;
    try {
      await fixture.configure();
      await typeComposer(page, "/skill-creator save this as a skill");
      await sendComposer(page);
      const sent = await chatRequest(fixture);
      assert.match(sent, /<skill name=\\"skill-creator\\">/);
      assert.match(sent, /<message>\\nsave this as a skill\\n<\/message>/);
    } finally {
      await fixture.close();
    }
  },
);
