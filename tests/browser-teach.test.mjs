import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { TEACH_STATE } from "../src/shared/teach/types.ts";
import { TOOL_NAME } from "../src/shared/tool-names.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import {
  chatText,
  openSidePanel,
  send,
  startTaskExtension,
  storageValue,
  t,
} from "./browser-tasks-helpers.mjs";
import { ref } from "./browser-tool-fixture.mjs";
import { clickElement, pressKey, typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// Teach mode end to end on the production build: the user records a task
// on a local form with real input events (a password field among them),
// stops, the local model writes the skill, the save card shows it, the
// check run does it again in its own tab and waits for the user before
// the final submit, and the skill is saved verified. Nothing the user
// typed reaches storage, the skill, the chat or a model request, and the
// agent refuses to work in the tab while it is recorded.

const EMAIL = "ada.private@example.test";
const PASSWORD = "Hunter2-Secret!";
const CHECK_PASSWORD = "Check-Pass-77!";
const CHECK_EMAIL = "run@example.test";
const SKILL_NAME = "submit-test-signup";

const FORM = `<!doctype html><title>Sign up</title>
<main><h1>Test signup</h1>
<form method="post" action="/done" aria-label="Signup">
<label>Email <input name="email" type="email" autocomplete="email"></label>
<label>Password <input name="password" type="password" autocomplete="new-password"></label>
<label>Plan <select name="plan"><option>Free</option><option>Weekly</option><option>Monthly</option></select></label>
<label><input type="checkbox" name="terms"> I agree</label>
<button type="submit">Create account</button>
</form></main>`;
const DONE = `<!doctype html><title>Welcome</title><main><h1>Account created</h1></main>`;

const SKILL_MD = `---
name: "Submit test signup"
description: "Creates an account on the test signup page. Use when the user asks to sign up there. Inputs: email, password (sensitive), plan."
---

# Submit test signup

## Goal
Create an account.

## Inputs
- email (required)
- password (sensitive)
- plan

## Steps
1. Open the signup page.
2. Type the email into the **Email** field.
3. Let the user fill **Password** on the page.
4. Choose the plan in **Plan**, tick **I agree**.
5. Confirm with the user, then click **Create account**.

## Check it worked
The page says "Account created".`;

const lastTool = (body) =>
  body.messages.findLast((message) => message.role === "tool")?.content || "";
const toolText = (body) => {
  const content = lastTool(body);
  return typeof content === "string" ? content : JSON.stringify(content);
};
const userText = (body) =>
  JSON.stringify(body.messages.filter((message) => message.role === "user"));

const ask = (question, options) => ({
  name: TOOL_NAME.ask,
  args: {
    questions: [{ question, options: options.map((label) => ({ label })) }],
  },
});

// The check run, one call per reply (counted by tool results so far).
function checkStep(body, done) {
  const tabId = Number(userText(body).match(/in tab (\d+)/)?.[1]);
  const snapshot = { name: TOOL_NAME.snapshot, args: { tabId } };
  const steps = [
    () => ask("Which email should I use?", ["The test address"]),
    () => snapshot,
    (text) => ({
      name: TOOL_NAME.act,
      args: {
        tabId,
        steps: [
          {
            action: "type",
            ref: ref(text, 'textbox "Email"'),
            text: CHECK_EMAIL,
          },
          {
            action: "select",
            ref: ref(text, 'combobox "Plan"'),
            value: "Weekly",
          },
          { action: "click", ref: ref(text, 'checkbox "I agree"') },
        ],
      },
    }),
    () =>
      ask(
        "Please type your password into the Password field on the page, then choose Done.",
        ["Done"],
      ),
    () => ask("Create the account now?", ["Create it", "Not now"]),
    () => snapshot,
    (text) => ({
      name: TOOL_NAME.act,
      args: {
        tabId,
        steps: [{ action: "click", ref: ref(text, 'button "Create account"') }],
      },
    }),
    () => ({
      name: TOOL_NAME.skillCheck,
      args: { passed: true, summary: "The account was created." },
    }),
  ];
  const step = steps[done];
  if (!step) return { text: "The check passed: the account was created." };
  return { calls: [{ id: `check_${done}`, ...step(toolText(body)) }] };
}

function model(body) {
  const system = JSON.stringify(body.messages[0]?.content || "");
  if (system.includes("Skill from a recorded demonstration"))
    return { text: SKILL_MD };
  if (system.includes("concise chat titles")) return { text: "Teach" };
  if (userText(body).includes("Check the recorded skill"))
    return checkStep(
      body,
      body.messages.filter((message) => message.role === "tool").length,
    );
  return { text: "Done." };
}

const panelHas = (panel, selector, text = "") =>
  panel.call(
    ([selector, text]) =>
      [...document.querySelectorAll(selector)].some((node) =>
        node.textContent.includes(text),
      ),
    [selector, text],
  );

// The tab in front: the side panel runs as a tab here, and a hidden tab
// does not finish its animations.
const front = (page) => page.send("Page.bringToFront");

// Everything the extension stored: local and session storage.
const storedText = (page) =>
  page.call(async () =>
    JSON.stringify([
      await chrome.storage.local.get(null),
      await chrome.storage.session.get(null),
    ]),
  );

test(
  "teach mode records a demonstration, writes and checks a skill, and keeps no typed value",
  { timeout: BROWSER_TEST_TIMEOUT * 3 },
  async () => {
    const session = await startTaskExtension({
      pages: { "/form": FORM, "/done": DONE },
      model,
    });
    const { browser, fixture, options } = session;
    try {
      const panel = await openSidePanel(browser, session.extensionUrl);
      // The page opens last, so it is the window's active tab.
      const page = await browser.open(session.url("/form"));

      // Start from the composer's + menu.
      await clickElement(
        panel,
        `.composer-icon-button[aria-label="${t.common.add}"]`,
      );
      await clickElement(panel, ".action-list-item", {
        text: t.teach.menu.title,
      });
      await front(panel);
      await poll(() => panelHas(panel, ".teach-card", t.teach.start.title));
      await clickElement(panel, ".teach-card button[type=submit]");
      await poll(() => panelHas(panel, ".teach-card", t.teach.recording.empty));
      // The pill is on the page, marked as the extension's own.
      await poll(() =>
        page.call(() => !!document.querySelector("[data-oba-ui]")),
      );

      // The demonstration, with real input events.
      await typeText(page, EMAIL, 'input[name="email"]');
      await typeText(page, PASSWORD, 'input[name="password"]');
      await clickElement(page, 'select[name="plan"]');
      await pressKey(page, "ArrowDown");
      await pressKey(page, "Enter");
      await clickElement(page, 'input[name="terms"]');
      await poll(() => panelHas(panel, ".teach-step", "I agree"));

      // The agent does not work in the tab being recorded.
      const before = fixture.requests.length;
      await front(page);
      await send(panel, "What is on this page?");
      await poll(() =>
        panelHas(panel, ".messages", t.display.errors.tabRecording),
      );
      assert.equal(
        fixture.requests
          .slice(before)
          .filter(
            (request) =>
              !JSON.stringify(request.body).includes("concise chat titles"),
          ).length,
        0,
      );

      await front(panel);
      await clickElement(page, 'button[type="submit"]');
      await poll(() => page.call(() => location.pathname === "/done"));
      await poll(() => panelHas(panel, ".teach-step", "Create account"));
      const steps = await panel.call(() =>
        [...document.querySelectorAll(".teach-step-text")].map(
          (node) => node.textContent,
        ),
      );
      assert.equal(steps.length, 5, steps.join(" | "));
      assert.match(steps[1], new RegExp(t.teach.recording.secret));

      // Stop: the model writes the skill; the save card shows its name.
      await clickElement(panel, ".teach-card button", {
        text: t.teach.recording.stop,
        exact: true,
      });
      await poll(() => panelHas(panel, ".teach-card", t.teach.save.title));
      const shownName = await panel.call(
        () => document.querySelector(".teach-card input").value,
      );
      assert.equal(shownName, SKILL_NAME);
      const writeRequest = fixture.requests.find((request) =>
        JSON.stringify(request.body).includes(
          "Skill from a recorded demonstration",
        ),
      );
      assert.match(
        JSON.stringify(writeRequest.body),
        /value withheld: field 'Email'/,
      );
      assert.match(JSON.stringify(writeRequest.body), /secret value withheld/);

      // Save and check: a new tab and a new chat run the skill once.
      await clickElement(panel, ".teach-card button", {
        text: t.teach.save.check,
        exact: true,
      });
      const check = await browser.attach((url) => url.endsWith("/form"));
      await front(panel);
      await poll(() =>
        panelHas(panel, ".tool-question-option", "The test address"),
      );
      await clickElement(panel, ".tool-question-option", {
        text: "The test address",
      });
      await clickElement(panel, ".tool-question-stack button[type=submit]");

      // The password goes into the page, never into the chat.
      await poll(() => panelHas(panel, ".tool-question-option", "Done"));
      await poll(() =>
        check.call(
          (email) =>
            document.querySelector('input[name="email"]').value === email,
          CHECK_EMAIL,
        ),
      );
      await typeText(check, CHECK_PASSWORD, 'input[name="password"]');
      await clickElement(panel, ".tool-question-option", { text: "Done" });
      await clickElement(panel, ".tool-question-stack button[type=submit]");

      // It waits before the final submit until the user confirms.
      await poll(() => panelHas(panel, ".tool-question-option", "Create it"));
      assert.equal(await check.call(() => location.pathname), "/form");
      await clickElement(panel, ".tool-question-option", { text: "Create it" });
      await clickElement(panel, ".tool-question-stack button[type=submit]");
      await poll(() =>
        check.call(() => location.pathname === "/done").catch(() => false),
      );

      // Verified, still used only when picked, with automatic use offered.
      await poll(() => panelHas(panel, ".teach-card", t.teach.check.auto));
      const skills = await storageValue(options, STORAGE_KEYS.skills);
      const skill = skills.find((item) => item.name === SKILL_NAME);
      assert.ok(skill, "the skill is stored");
      assert.match(skill.files[0].content, /status: "verified"/);
      assert.match(skill.files[0].content, /source: "demonstration"/);
      const settings = await storageValue(options, STORAGE_KEYS.skillSettings);
      assert.equal(settings[skill.id]?.invoke, "manual");
      await clickElement(panel, ".teach-card button", {
        text: t.teach.check.auto,
      });
      await poll(
        async () =>
          (await storageValue(options, STORAGE_KEYS.skillSettings))[
            skill.id
          ] === undefined,
      );
      const sessions = await options.call(
        async (key) => (await chrome.storage.session.get(key))[key],
        STORAGE_KEYS.teachSessions,
      );
      assert.ok(
        !Object.values(sessions || {}).some(
          (item) => item.state === TEACH_STATE.recording,
        ),
      );

      // No typed value anywhere: storage (with the skill's files and the
      // chats), the side panel, any model request.
      const stored = await storedText(options);
      const requests = JSON.stringify(
        fixture.requests.map((request) => request.body),
      );
      const shown = await chatText(panel);
      for (const secret of [EMAIL, PASSWORD, CHECK_PASSWORD]) {
        assert.ok(!stored.includes(secret), `storage holds ${secret}`);
        assert.ok(
          !requests.includes(secret),
          `a model request holds ${secret}`,
        );
        assert.ok(!shown.includes(secret), `the chat shows ${secret}`);
      }
    } finally {
      await session.close();
    }
  },
);
