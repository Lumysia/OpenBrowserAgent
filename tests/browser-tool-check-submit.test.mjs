import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";

// In the check run of a recorded skill, act refuses steps that would submit
// a form until the user confirmed (the confirmation itself is in
// browser-teach.test.mjs). Which steps submit is read from the page's
// structure: submit buttons and inputs, and Enter in an input of a form
// (the agent's Enter submits it).

const PAGE = `<title>Forms</title>
<form action="/done" aria-label="With button">
  <label>Name <input name="name"></label>
  <button><span>Send it</span></button>
  <button type="button">Preview</button>
</form>
<form action="/done" aria-label="Two fields">
  <label>First <input name="first"></label>
  <label>Second <input name="second"></label>
</form>
<form action="/done" aria-label="One field">
  <label>Only <input name="only"></label>
</form>
<form action="/done" aria-label="Image">
  <input type="image" alt="Go" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="20" height="20">
</form>`;

const REFUSED = "this is a check run: ask the user first";

test(
  "a check run's act refuses steps that would submit a form, by structure",
  { timeout: BROWSER_TEST_TIMEOUT * 2 },
  async () => {
    const fixture = await browserToolFixture((request, response) => {
      if (!request.url.startsWith("/forms") && !request.url.startsWith("/done"))
        return false;
      response.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
      return true;
    });
    try {
      const tabId = await fixture.open("/forms");
      const [snapshot] = await fixture.run([
        { name: "snapshot", args: { tabId } },
      ]);
      const act = (step) => ({
        name: "act",
        args: { tabId, steps: [step] },
      });
      const steps = {
        clickSubmit: {
          action: "click",
          ref: ref(snapshot, 'button "Send it"'),
        },
        clickImage: { action: "click", ref: ref(snapshot, 'button "Go"') },
        enterWithButton: {
          action: "type",
          ref: ref(snapshot, 'textbox "Name"'),
          text: "x",
          submit: true,
        },
        enterOnlyField: {
          action: "press",
          ref: ref(snapshot, 'textbox "Only"'),
          key: "Enter",
        },
        clickButtonTypeButton: {
          action: "click",
          ref: ref(snapshot, 'button "Preview"'),
        },
        enterTwoFields: {
          action: "press",
          ref: ref(snapshot, 'textbox "First"'),
          key: "Enter",
        },
        pressOtherKey: {
          action: "press",
          ref: ref(snapshot, 'textbox "First"'),
          key: "Tab",
        },
        typeNoSubmit: {
          action: "type",
          ref: ref(snapshot, 'textbox "Second"'),
          text: "y",
        },
      };
      const names = Object.keys(steps);
      const texts = await fixture.run(
        names.map((name) => act(steps[name])),
        { metadata: { skillCheck: { skillId: "fixture-skill" } } },
      );
      const refused = Object.fromEntries(
        names.map((name, index) => [name, texts[index].includes(REFUSED)]),
      );
      assert.deepEqual(refused, {
        clickSubmit: true,
        clickImage: true,
        enterWithButton: true,
        enterOnlyField: true,
        clickButtonTypeButton: false,
        enterTwoFields: true,
        pressOtherKey: false,
        typeNoSubmit: false,
      });
      const path = await fixture.evaluate(tabId, "location.pathname");
      assert.equal(path, "/forms");

      // Outside a check run the same click submits.
      const [plain] = await fixture.run([act(steps.clickSubmit)]);
      assert.ok(!plain.includes(REFUSED), plain);
    } finally {
      await fixture.close();
    }
  },
);
