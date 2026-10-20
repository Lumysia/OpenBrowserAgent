import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRecordedSkill } from "../src/shared/teach/skill-files.ts";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { startTaskExtension, t } from "./browser-tasks-helpers.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// Settings → Skills offers "Check again" for a recorded draft: it opens the
// side panel, which runs the skill's check in a new tab and chat.

const PAGE = `<!doctype html><title>Form</title><main><h1>Form</h1><button>Save</button></main>`;

test(
  "Check again in Settings runs a recorded draft's check in the side panel",
  { timeout: BROWSER_TEST_TIMEOUT * 2 },
  async () => {
    const session = await startTaskExtension({
      pages: { "/form": PAGE },
      model: () => ({ text: "Checked." }),
    });
    const { browser, fixture, options } = session;
    try {
      const skill = buildRecordedSkill({
        session: {
          steps: [],
          startUrl: session.url("/form"),
          startedAt: 1,
        },
        draft: {
          name: "save-form",
          description: "Saves the form. Use when asked.",
          body: "## Steps\n1. Click Save.",
        },
        existingNames: [],
      });
      await options.call(
        ([key, skills]) => chrome.storage.local.set({ [key]: skills }),
        [STORAGE_KEYS.skills, [skill]],
      );
      await options.call((hash) => {
        location.hash = hash;
        location.reload();
      }, OPTIONS_HASH.skills);
      await poll(() =>
        options
          .call(() => !!document.querySelector(".settings-summary-name"))
          .catch(() => false),
      );
      await clickElement(options, ".settings-summary-name", {
        text: "save-form",
      });
      await clickElement(options, ".skill-detail button", {
        text: t.teach.checkAgain,
      });

      // The side panel opens and sends the check run.
      await poll(() =>
        fixture.requests.some((request) =>
          JSON.stringify(request.body).includes(
            'Check the recorded skill \\"save-form\\"',
          ),
        ),
      );
      const tabs = await options.call(async () =>
        (await chrome.tabs.query({})).map((tab) => tab.url),
      );
      assert.ok(
        tabs.some((url) => url.endsWith("/form")),
        `a check tab: ${tabs.join(", ")}`,
      );
    } finally {
      await session.close();
    }
  },
);
