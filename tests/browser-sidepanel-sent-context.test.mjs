import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n.ts";
import { clickElement, elementCenter, hoverTooltip } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  BROWSER_TEST_TIMEOUT,
  fixtureProvider,
  servePages,
  startExtension,
} from "./browser-harness.mjs";
import {
  SENT_CONTEXT_ELEMENT,
  SENT_CONTEXT_FILES,
  SENT_CONTEXT_PAGES,
  SENT_CONTEXT_PROMPTS,
  SENT_CONTEXT_TABS,
  SENT_CONTEXT_TEXT,
  openSentContextChat,
  openSentContextTabs,
  seedSentContextChat,
} from "./sent-context-fixture.mjs";

const t = getMessages("en-US");
const PILL = ".sent-context-pills .ui-context-pill";

// Each user message's pills and how they sit against its bubble and the
// actions row under them.
function sentContext(panel) {
  return panel.call((selector) => {
    const box = (element) => element.getBoundingClientRect();
    return [...document.querySelectorAll(".message.user")].map((message) => {
      const bubble = box(message.querySelector(".user-bubble"));
      const list = message.querySelector(".sent-context-pills");
      const actions = box(message.querySelector(".user-message-actions"));
      const pills = [...message.querySelectorAll(selector)].map((pill) => {
        const rect = box(pill);
        const label = pill.querySelector(".ui-context-pill-label");
        return {
          text: pill.textContent,
          button: pill.tagName === "BUTTON",
          unavailable: pill.hasAttribute("data-unavailable"),
          // One line: the label's text has one line box, inside the pill.
          oneLine:
            label.getClientRects().length === 1 &&
            box(label).height <= rect.height &&
            rect.height < 30,
          right: rect.right,
        };
      });
      return {
        prompt: message.querySelector(".user-bubble").textContent,
        pills: pills.map(({ right, ...pill }) => pill),
        alignedRight:
          !!pills.length &&
          Math.abs(
            Math.max(...pills.map((pill) => pill.right)) - bubble.right,
          ) < 1 &&
          pills.every((pill) => pill.right <= bubble.right + 0.5),
        gapToBubble: list && box(list).top - bubble.bottom,
        gapToActions: list && actions.top - box(list).bottom,
      };
    });
  }, PILL);
}

// Bubbles pop in and pills slide in; boxes are measured once they are still.
function animationsDone(panel) {
  return poll(() =>
    panel.call(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== "running" ||
            animation.effect?.getComputedTiming().endTime === Infinity,
        ),
    ),
  );
}

async function pillTooltip(panel, text) {
  return hoverTooltip(panel, await elementCenter(panel, PILL, { text }), {
    timeoutMs: 15000,
  });
}

test(
  "side panel shows what a message was sent with as pills under its bubble",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      handle: (request, response) => {
        if (!servePages(SENT_CONTEXT_PAGES, request, response))
          response.writeHead(404).end();
      },
      storage: (baseUrl) => ({
        provider: { fixture: fixtureProvider(baseUrl) },
        language: "en-US",
        preferences: { selectedModelId: "fixture" },
      }),
    });
    const { browser, extensionUrl, options } = session;
    try {
      const tabs = await openSentContextTabs(options, session.url);
      await seedSentContextChat(options, tabs);
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      await openSentContextChat(panel, t.sidepanel.chatHistory);
      // Files load from storage after the chat shows.
      await poll(async () =>
        (await sentContext(panel))[2]?.pills.some((pill) => !pill.unavailable),
      );

      await animationsDone(panel);
      const tab = (index, button = true) => ({
        text: SENT_CONTEXT_TABS[index].title,
        button,
        unavailable: false,
        oneLine: true,
      });
      const plain = (text, unavailable = false) => ({
        text,
        button: false,
        unavailable,
        oneLine: true,
      });
      const messages = await sentContext(panel);
      assert.deepEqual(
        messages.map(({ prompt, pills }) => ({ prompt, pills })),
        [
          { prompt: SENT_CONTEXT_PROMPTS.oneTab, pills: [tab(0)] },
          {
            prompt: SENT_CONTEXT_PROMPTS.threeTabs,
            // Two of three, then the count of the rest.
            pills: [tab(1), tab(2), { ...tab(0), text: "+1" }],
          },
          {
            prompt: SENT_CONTEXT_PROMPTS.files,
            pills: [
              plain(SENT_CONTEXT_FILES.image.name),
              plain(SENT_CONTEXT_FILES.text.name),
              plain(SENT_CONTEXT_FILES.missing.name, true),
            ],
          },
          {
            prompt: SENT_CONTEXT_PROMPTS.selection,
            pills: [
              plain(SENT_CONTEXT_ELEMENT.innerText),
              plain(SENT_CONTEXT_TEXT),
            ],
          },
        ],
      );
      for (const message of messages) {
        assert.equal(message.alignedRight, true, message.prompt);
        assert.ok(
          message.gapToBubble >= 0 &&
            message.gapToBubble < message.gapToActions,
          `${message.prompt}: ${message.gapToBubble} / ${message.gapToActions}`,
        );
      }

      // Tooltips hold what the line leaves out.
      const host = new URL(session.url("/")).host;
      assert.equal(
        await pillTooltip(panel, SENT_CONTEXT_TABS[0].title),
        `${SENT_CONTEXT_TABS[0].title}\n${host}`,
      );
      assert.equal(
        await pillTooltip(panel, SENT_CONTEXT_FILES.missing.name),
        `${SENT_CONTEXT_FILES.missing.name}\n${t.sidepanel.attachmentUnavailable}`,
      );
      assert.equal(await pillTooltip(panel, "+1"), SENT_CONTEXT_TABS[3].title);
      assert.equal(
        await pillTooltip(panel, SENT_CONTEXT_TEXT.slice(0, 20)),
        SENT_CONTEXT_TEXT,
      );

      // "+1" shows the rest.
      await clickElement(panel, PILL, { text: "+1", exact: true });
      await poll(async () =>
        (await sentContext(panel))[1].pills.every((pill) => pill.text !== "+1"),
      );
      assert.deepEqual(
        (await sentContext(panel))[1].pills.map((pill) => pill.text),
        SENT_CONTEXT_TABS.slice(1, 4).map((item) => item.title),
      );

      // A tab pill brings its tab to the front.
      const activeTab = () =>
        options.call(
          async () => (await chrome.tabs.query({ active: true }))[0]?.id,
        );
      for (const index of [1, 0]) {
        await clickElement(panel, PILL, {
          text: SENT_CONTEXT_TABS[index].title,
          exact: true,
        });
        await poll(async () => (await activeTab()) === tabs[index].id);
      }
    } finally {
      await session.close();
    }
  },
);
