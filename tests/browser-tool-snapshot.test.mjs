import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// The states a snapshot shows for fields.
const PAGES = {
  "/fields": `<title>Fields</title>
<p><label>Start <input type="date" required></label></p>
<p><label>Pick a day <input readonly value="2026-11-02"></label></p>
<p><label>Email <input type="email" aria-invalid="true" value="a@"></label></p>
<p><div role="combobox" aria-label="Day picker" aria-readonly="true" aria-required="true" tabindex="0">Choose</div></p>
<p><label>Agree <input type="checkbox" readonly required></label></p>
<p><label>Name <input></label></p>`,
};

test("snapshot field states", { timeout: BROWSER_TEST_TIMEOUT }, async () => {
  const fixture = await browserToolFixture((request, response) => {
    if (!PAGES[request.url]) return false;
    response
      .writeHead(200, { "Content-Type": "text/html" })
      .end(PAGES[request.url]);
    return true;
  });
  try {
    const tabId = await fixture.open("/fields");
    const [snapshot] = await fixture.run([
      { name: "snapshot", args: { tabId } },
    ]);
    // A field's states, after its ref.
    const states = (label) =>
      snapshot.match(new RegExp(`${label}"? \\[?e\\d+\\]? ([^\\]\\n]*)`))?.[1];
    assert.equal(states('textbox "Start'), 'value="" type=date required');
    assert.equal(states('textbox "Pick a day'), 'value="2026-11-02" readonly');
    assert.equal(states('textbox "Email'), 'value="a@" type=email invalid');
    assert.equal(states('combobox "Day picker'), "readonly required");
    // HTML ignores readonly on a checkbox.
    assert.equal(states('checkbox "Agree'), "unchecked required");
    assert.equal(states('textbox "Name'), 'value=""');
  } finally {
    await fixture.close();
  }
});
