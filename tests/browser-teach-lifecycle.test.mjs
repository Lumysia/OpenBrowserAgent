import assert from "node:assert/strict";
import { test } from "node:test";
import { TEACH_STATE } from "../src/shared/teach/types.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import {
  tabIdOf,
  teachSession,
  teachSessions,
  waitForRecorder,
} from "./browser-teach-helpers.mjs";
import {
  openSidePanel,
  startTaskExtension,
  t,
} from "./browser-tasks-helpers.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// One recording at a time, and a recording that ends without the user (its
// tab closed) waits in the side panel until they choose to write it.

const PAGE = (title) =>
  `<!doctype html><title>${title}</title><main><h1>${title}</h1><button>Save ${title}</button></main>`;

const SKILL_MD = `---
name: "save-first"
description: "Saves the first page. Use when asked."
---

## Steps
1. Save.`;

const isWriteRequest = (request) =>
  JSON.stringify(request.body).includes("Skill from a recorded demonstration");

const panelHas = (panel, text) =>
  panel.call(
    (text) =>
      [...document.querySelectorAll(".teach-card")].some((node) =>
        node.textContent.includes(text),
      ),
    text,
  );

const front = (page) => page.send("Page.bringToFront");

async function openRecordStart(panel) {
  await clickElement(
    panel,
    `.composer-icon-button[aria-label="${t.common.add}"]`,
  );
  await clickElement(panel, ".action-list-item", { text: t.teach.menu.title });
  await front(panel);
  await poll(() => panelHas(panel, t.teach.start.title));
}

test(
  "a second recording is refused with a way to the open one, and a closed tab's recording waits for the user",
  { timeout: BROWSER_TEST_TIMEOUT * 2 },
  async () => {
    const session = await startTaskExtension({
      pages: { "/first": PAGE("First"), "/second": PAGE("Second") },
      model: (body) =>
        JSON.stringify(body.messages[0]?.content || "").includes(
          "Skill from a recorded demonstration",
        )
          ? { text: SKILL_MD }
          : { text: "Done." },
    });
    const { browser, fixture } = session;
    try {
      const panel = await openSidePanel(browser, session.extensionUrl);
      const first = await browser.open(session.url("/first"));
      const firstId = await tabIdOf(panel, "/first");
      await openRecordStart(panel);
      await clickElement(panel, ".teach-card button[type=submit]");
      await waitForRecorder(panel, firstId);
      await front(first);
      await clickElement(first, "button");
      await poll(
        async () => (await teachSession(panel, firstId))?.steps.length === 1,
      );

      // A second recording, in another tab: refused, with the way back.
      const second = await browser.open(session.url("/second"));
      await front(second);
      await openRecordStart(panel);
      await poll(() => panelHas(panel, t.teach.start.busy));
      assert.equal(
        await panel.call(
          () => !!document.querySelector(".teach-card button[type=submit]"),
        ),
        false,
      );
      await clickElement(panel, ".teach-card button", {
        text: t.teach.start.showRecording,
      });
      await poll(() =>
        panel.call(async (id) => (await chrome.tabs.get(id)).active, firstId),
      );
      await front(panel);
      await poll(() => panelHas(panel, t.teach.recording.stop));
      assert.equal(Object.keys(await teachSessions(panel)).length, 1);

      // The recorded tab closes: nothing goes to the model until the user
      // writes the skill from the side panel.
      await panel.call((id) => chrome.tabs.remove(id), firstId);
      await poll(() => panelHas(panel, t.teach.ended.tabClosed));
      const ended = await teachSession(panel, firstId);
      assert.equal(ended.state, TEACH_STATE.ended);
      assert.equal(fixture.requests.filter(isWriteRequest).length, 0);
      await clickElement(panel, ".teach-card button", {
        text: t.teach.ended.write,
      });
      await poll(() => panelHas(panel, t.teach.save.title));
      assert.equal(fixture.requests.filter(isWriteRequest).length, 1);
    } finally {
      await session.close();
    }
  },
);
