import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n.ts";
import { TOOL_NAME } from "../src/shared/tool-names.ts";
import { sendComposer, typeComposer } from "./browser-composer.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  BROWSER_TEST_TIMEOUT,
  fixtureProvider,
  startExtension,
} from "./browser-harness.mjs";
import { reply } from "./provider-fixtures.ts";

const t = getMessages("en-US");
const askLabel = t.sidepanel.tool[TOOL_NAME.ask];

const QUESTION = "Start a return for the bracket?";
const askCall = (id) => ({
  id,
  name: TOOL_NAME.ask,
  args: {
    questions: [
      {
        question: QUESTION,
        options: [{ label: "Yes" }, { label: "No" }, { label: "Later" }],
      },
    ],
  },
});

// Each scenario's prompt names it; the reply depends on how many tool
// results came back since that prompt.
const SCENARIOS = {
  // A failed tool earlier in the reply, then the answer and a question.
  FAILFIRST: [
    { calls: [{ id: "fail_1", name: TOOL_NAME.tabs, args: { action: "x" } }] },
    { text: "There is a Return items entry. ", calls: [askCall("ask_1")] },
    { text: "FAILFIRST done." },
  ],
  // The question with another call after it in the same message.
  ASKTHEN: [
    {
      text: "Before I go on: ",
      calls: [
        askCall("ask_2"),
        { id: "tabs_2", name: TOOL_NAME.tabs, args: { action: "list" } },
      ],
    },
    { text: "ASKTHEN done." },
  ],
  // The user writes in the message box instead of answering.
  TYPED: [{ calls: [askCall("ask_3")] }, { text: "TYPED done." }],
  STOPPED: [{ calls: [askCall("ask_4")] }],
  REOPEN: [{ calls: [askCall("ask_5")] }, { text: "REOPEN done." }],
  WORKER: [{ calls: [askCall("ask_6")] }],
  // A model that writes the call as text: it is text, not a question.
  TEXTCALL: [
    {
      text: `Will do. <tool_call>${JSON.stringify({ name: "ask", arguments: askCall("x").args })}</tool_call>`,
    },
  ],
  AFTER: [{ text: "AFTER done." }],
};

function scenarioStep(request) {
  const messages = request.body.messages;
  const index = messages.findLastIndex(
    (item) =>
      item.role === "user" &&
      Object.keys(SCENARIOS).some((key) =>
        JSON.stringify(item.content).includes(key),
      ),
  );
  const content = JSON.stringify(messages[index]?.content);
  const key = Object.keys(SCENARIOS).find((item) => content.includes(item));
  const results = messages
    .slice(index + 1)
    .filter((item) => item.role === "tool").length;
  const steps = SCENARIOS[key] || [{ text: "?" }];
  return steps[Math.min(steps.length - 1, results)];
}

function lastToolResult(request, id) {
  return request.body.messages.findLast(
    (item) => item.role === "tool" && item.tool_call_id === id,
  )?.content;
}

test(
  "side panel question cards are answerable while the run waits, and closed once nothing waits",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      handle: (request, response) => {
        if (!request.url.startsWith("/v1/"))
          return response.writeHead(404).end();
        reply(response, "openai", scenarioStep(request));
      },
      storage: (baseUrl) => ({
        provider: { fixture: fixtureProvider(baseUrl) },
        language: "en-US",
        preferences: { selectedModelId: "fixture", autoRetry: false },
      }),
    });
    const { browser, extensionUrl, fixture } = session;
    let panel;
    const openPanel = async () => {
      panel = await browser.open(extensionUrl("sidepanel.html"));
      await poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );
    };
    // The last question card of the chat.
    const card = () =>
      panel.call(() => {
        const cards = [...document.querySelectorAll(".tool-card")].filter(
          (item) =>
            item.querySelector(".tool-question-stack, .tool-question-answers"),
        );
        const item = cards.at(-1);
        if (!item) return undefined;
        const options = [...item.querySelectorAll(".tool-question-option")];
        return {
          title: item.querySelector(".tool-title-text")?.textContent || "",
          form: !!item.querySelector("form.tool-question-stack"),
          optionsEnabled:
            options.length > 0 && options.every((o) => !o.disabled),
          answers:
            item.querySelector(".tool-question-answers")?.textContent || "",
        };
      });
    const streaming = () =>
      panel.call(() => !!document.querySelector(".stop-button"));
    const text = () =>
      panel.call(() => document.querySelector(".messages")?.textContent || "");
    const send = async (value) => {
      await typeComposer(panel, value);
      await sendComposer(panel);
    };
    const answer = async (option) => {
      await clickElement(panel, ".tool-question-option", { text: option });
      await clickElement(panel, ".tool-question-stack button[type=submit]");
    };
    const pending = async () => {
      const value = await poll(async () => {
        const item = await card();
        return item?.form && item.optionsEnabled && item;
      }).catch(async () =>
        assert.fail(`not answerable: ${JSON.stringify(await card())}`),
      );
      assert.equal(value.title, askLabel.running);
    };
    const closed = async () => {
      const value = await poll(async () => {
        const item = await card();
        return item && !item.form && !(await streaming()) && item;
      });
      assert.notEqual(value.title, askLabel.running);
      assert.ok(value.answers.includes(t.sidepanel.questionNoAnswer));
    };
    const requestFor = (id) =>
      poll(() =>
        fixture.requests.findLast((request) => lastToolResult(request, id)),
      );
    try {
      await openPanel();

      // A failed tool earlier in the reply does not end the reply.
      await send("FAILFIRST please");
      await pending();
      await answer("Yes");
      await poll(async () => (await text()).includes("FAILFIRST done."));
      assert.match(lastToolResult(await requestFor("ask_1"), "ask_1"), /Yes/);

      // A call after the question in the same message waits its turn.
      await send("ASKTHEN please");
      await pending();
      await answer("No");
      await poll(async () => (await text()).includes("ASKTHEN done."));

      // Writing in the message box instead closes the question and sends
      // the message on.
      await send("TYPED please");
      await pending();
      await send("Only the bracket, thanks");
      await poll(async () => (await text()).includes("TYPED done."));
      await closed();
      const typed = await requestFor("ask_3");
      assert.ok(
        JSON.stringify(typed.body.messages).includes("Only the bracket"),
      );

      // Stopped: nothing waits; the message box starts the next turn.
      await send("STOPPED please");
      await pending();
      await clickElement(panel, ".stop-button");
      await closed();
      await send("AFTER stop");
      await poll(async () => (await text()).includes("AFTER done."));

      // A reopened panel can still answer.
      await send("REOPEN please");
      await pending();
      await panel.send("Page.close").catch(() => undefined);
      await openPanel();
      await clickElement(
        panel,
        `button[aria-label="${t.sidepanel.chatHistory}"]`,
      );
      // The history page fills the panel's width.
      assert.equal(
        await panel.call(
          () =>
            document.querySelector(".history-page").getBoundingClientRect()
              .width === document.documentElement.clientWidth,
        ),
        true,
      );
      await clickElement(panel, ".history-select");
      await pending();
      await answer("Later");
      await poll(async () => (await text()).includes("REOPEN done."));

      // The background restarted: the question closes.
      await send("WORKER please");
      await pending();
      const worker = (await browser.targets()).find(
        (item) =>
          item.type === "service_worker" &&
          item.url === extensionUrl("background.js"),
      );
      await browser.browser.send("Target.closeTarget", {
        targetId: worker.id,
      });
      await closed();

      // A call written as text is shown as text; nothing waits.
      const cards = () =>
        panel.call(() => document.querySelectorAll(".tool-card").length);
      const before = await cards();
      await send("TEXTCALL please");
      await poll(async () => (await text()).includes("Will do."));
      await poll(async () => !(await streaming()));
      assert.equal(await cards(), before);
    } finally {
      await session.close();
    }
  },
);
