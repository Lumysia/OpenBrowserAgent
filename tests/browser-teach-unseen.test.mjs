import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCount } from "../src/shared/i18n.ts";
import { TEACH_MESSAGE } from "../src/shared/teach/messages.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import {
  tabIdOf,
  teach,
  teachSession,
  waitForRecorder,
} from "./browser-teach-helpers.mjs";
import {
  openSidePanel,
  startTaskExtension,
  t,
} from "./browser-tasks-helpers.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// A page cannot hide steps from a recording: it cannot pass for the
// extension's own UI (that is known by identity, not by an attribute), and
// input it keeps from the recorder, or work in an embedded frame, shows up
// as a warning in the step list.

const PAGE = (frameUrl) => `<!doctype html><title>Account</title>
<main><h1>Account</h1>
<button id="mark">Mark as extension UI</button>
<button id="after">Rename account</button>
<button id="danger">Delete my account</button>
<iframe src="${frameUrl}" width="300" height="80"></iframe>
</main>
<script>
document.getElementById('mark').onclick = () => {
  document.documentElement.setAttribute('data-oba-ui', '');
  document.body.setAttribute('data-oba-ui', '');
};
// Registered before any recorder: input on #danger stops here.
for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click'])
  addEventListener(type, (event) => {
    if (event.target.id === 'danger') event.stopImmediatePropagation();
  }, true);
</script>`;

const FRAME = `<!doctype html><title>Embedded</title><input aria-label="Inside">`;

const panelHas = (panel, text) =>
  panel.call(
    (text) =>
      [...document.querySelectorAll(".teach-card")].some((node) =>
        node.textContent.includes(text),
      ),
    text,
  );

test(
  "a page cannot pass for the extension's UI, and input the recorder could not see is flagged",
  { timeout: BROWSER_TEST_TIMEOUT * 2 },
  async () => {
    const session = await startTaskExtension({
      pages: () => ({
        "/account": PAGE(session.url("/frame", "localhost")),
        "/frame": FRAME,
      }),
      model: () => ({ text: "Done." }),
    });
    const { browser } = session;
    try {
      const panel = await openSidePanel(browser, session.extensionUrl);
      const page = await browser.open(session.url("/account"));
      const tabId = await tabIdOf(panel, "/account");
      await teach(panel, { type: TEACH_MESSAGE.start, tabId });
      await waitForRecorder(panel, tabId);
      const names = async () =>
        ((await teachSession(panel, tabId))?.steps || []).map(
          (step) => step.target?.name,
        );

      // The page marks itself with the attribute the extension once used:
      // later clicks are still recorded.
      await clickElement(page, "#mark");
      await clickElement(page, "#after");
      await poll(async () => (await names()).includes("Rename account"));
      assert.ok((await names()).includes("Mark as extension UI"));

      // Input the page keeps from the recorder makes no step, but a warning
      // (once the activation of the clicks before has run out).
      await poll(() => page.call(() => !navigator.userActivation.isActive));
      await clickElement(page, "#danger");
      await poll(
        async () => (await teachSession(panel, tabId))?.unrecorded?.input >= 1,
      );
      assert.ok(!(await names()).includes("Delete my account"));
      await poll(() =>
        panelHas(panel, formatCount(t.teach.recording.unrecorded, 1)),
      );

      // Work in an embedded frame of another site is not recorded: counted.
      await clickElement(page, "iframe");
      await poll(
        async () =>
          (await teachSession(panel, tabId))?.unrecorded?.frames === 1,
      );
      await poll(() =>
        panelHas(panel, formatCount(t.teach.recording.frames, 1)),
      );

      // Ordinary clicks raised no warning of their own.
      assert.equal((await teachSession(panel, tabId)).unrecorded.input, 1);
    } finally {
      await session.close();
    }
  },
);
