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
  // Icon-only controls: no text, no label.
  "/icons": `<title>Icons</title>
<p><a href="/config/integrations?tab=all"><svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg></a></p>
<p><a href="https://other.test/docs/start"><svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg></a></p>
<p><a href="#top"><svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg></a></p>
<p><a title="Settings" href="/settings"><svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg></a></p>
<p><button><svg width="16" height="16"><title>Close</title><circle cx="8" cy="8" r="4"/></svg></button></p>
<p><button><span aria-label="Delete" style="display:inline-block;width:16px;height:16px"></span></button></p>
<p><a href="/profile"><img alt="Profile" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></p>
<p>Read the <a href="/help/faq"><svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg></a> page or <a href="/named">the guide</a>.</p>`,
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

test(
  "unnamed links and buttons get a guessed name and its source",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const fixture = await browserToolFixture((request, response) => {
      if (!PAGES[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(PAGES[request.url]);
      return true;
    });
    try {
      const tabId = await fixture.open("/icons");
      const [snapshot] = await fixture.run([
        { name: "snapshot", args: { tabId } },
      ]);
      for (const line of [
        /link "\/config\/integrations\?tab=all" \(from href\) \[e\d+\]/,
        /link "other\.test\/docs\/start" \(from href\) \[e\d+\]/,
        /link "#top" \(from href\) \[e\d+\]/,
        /link "Settings" \(from title\) \[e\d+\]/,
        /button "Close" \(from icon\) \[e\d+\]/,
        /button "Delete" \(from icon\) \[e\d+\]/,
        /link "Profile" \(from image\) \[e\d+\]/,
        /Read the \[\/help\/faq \(from href\)\]\(e\d+\) page or \[the guide\]\(e\d+\) ?\./,
      ])
        assert.match(snapshot, line);
      assert.doesNotMatch(snapshot, /- (link|button) \[e\d+\]/);
    } finally {
      await fixture.close();
    }
  },
);
