import {
  providerFixture,
  reply,
  toolResults,
} from "../../tests/provider-fixtures.ts";
import {
  PAGE,
  PANEL,
  capture,
  click,
  delay,
  enter,
  extensionUrl,
  launch,
  openDemo,
  openPanel,
  paint,
  settle,
  size,
  type,
  waitForText,
} from "./browser.mjs";
import { composeSplit } from "./compose.mjs";
import { DEMO_URLS, renderPage } from "./demo.mjs";
import { BASE_PREFERENCES, MAIN_MODEL_ID, mainProvider } from "./seed.mjs";

const COMPOSER = ".composer-box textarea";
const TITLE_REQUEST = "Create concise chat titles";

// The chat provider points at the local fixture, which streams the scripted
// answers; storage is seeded through the extension's own options page.
// `preferences` adds to the shots' base preferences.
export async function seedChat(
  chromium,
  fixture,
  demo,
  agentId,
  preferences = {},
) {
  const options = await chromium.open(extensionUrl(chromium, "options.html"));
  await options.call(
    async ({ provider, preferences, locale }) => {
      await chrome.storage.local.set({
        provider: { [provider.id]: provider },
        language: locale,
        preferences,
      });
    },
    {
      provider: mainProvider(demo, `${fixture.baseUrl}/v1`),
      preferences: {
        ...BASE_PREFERENCES,
        selectedModelId: MAIN_MODEL_ID,
        selectedAgentId: agentId,
        ...preferences,
      },
      locale: demo.locale,
    },
  );
  await options.send("Page.close").catch(() => {});
}

const resultText = (result) =>
  typeof result.content === "string"
    ? result.content
    : result.content.map((part) => part.text || "").join("");

// The last line of a Markdown answer as the panel shows it, to wait for.
const lastLine = (markdown) =>
  markdown
    .split("\n")
    .at(-1)
    .replace(/\*\*|\[\[cite:[^\]]+\]\]|\{cite\}|^- /g, "")
    .trim();

// One chat shot: the demo page on the left and, on the right, the side panel
// after a scripted exchange with `agentId`.
async function chatShot({ demo, agentId, page, prompt, waitFor, handle }) {
  const fixture = await providerFixture((request, response) =>
    JSON.stringify(request.body).includes(TITLE_REQUEST)
      ? reply(response, request.protocol, { text: handle.title })
      : handle.answer(request, response),
  );
  const chromium = await launch(demo.locale);
  try {
    await seedChat(chromium, fixture, demo, agentId);
    const tab = await openDemo(
      chromium,
      DEMO_URLS[page],
      await renderPage(page, demo),
    );
    await size(tab, PAGE);
    const panel = await openPanel(chromium, demo.locale);
    await type(panel, COMPOSER, prompt);
    await enter(panel);
    await waitForText(panel, waitFor);
    await delay(2500);
    if (handle.afterAnswer) await handle.afterAnswer(panel);
    await settle(panel);
    await panel.call(() => {
      for (const element of document.querySelectorAll("*"))
        if (element.scrollTop) element.scrollTop = 0;
    });
    await delay(300);
    // A background tab lays out at its emulated size, and finishes its
    // transitions, only while it paints.
    await paint(panel);
    const warnings = [
      ...(await chipWarnings(panel)),
      ...(await fitWarnings(panel)),
    ];
    await tab.call(() => document.activeElement?.blur());
    await delay(300);
    const left = await capture(tab);
    const right = await capture(panel);
    return { png: await composeSplit(chromium, left, right), warnings };
  } finally {
    await chromium.close();
    await fixture.close();
  }
}

// Page titles in sent-context pills end in an ellipsis when they are too
// long; the demo titles should still fit, so report any that do not.
function chipWarnings(panel) {
  return panel.call(() =>
    [...document.querySelectorAll(".ui-context-pill-label")]
      .filter((label) => label.scrollWidth > label.clientWidth + 1)
      .map((label) => `page title clipped in pill: ${label.textContent}`),
  );
}

// The whole exchange must show between the header and the composer with
// what it holds (the attached page).
function fitWarnings(panel) {
  return panel.call(() => {
    const content = document.querySelector(".messages-content");
    const composer = document.querySelector("footer.composer");
    const header = document.querySelector(".sidepanel-header");
    if (!content || !composer) return ["side panel layout not found"];
    // Messages, not the empty spacer that keeps room for scrolling.
    const items = [...content.children].filter(
      (item) =>
        item.getBoundingClientRect().height > 0 && item.textContent.trim(),
    );
    const top = items[0].getBoundingClientRect().top;
    // The last message keeps a minimum height, so measure what it shows.
    const bottom = Math.max(
      ...[...items.at(-1).querySelectorAll("*")]
        .filter(
          (element) =>
            element.getBoundingClientRect().height > 0 &&
            (element.tagName === "svg" ||
              (!element.children.length && element.textContent.trim())),
        )
        .map((element) => element.getBoundingClientRect().bottom),
    );
    // What the composer shows: the attached page and the input, not the
    // empty row kept for the typing indicator.
    const composerTop = Math.min(
      ...[...composer.children]
        .filter(
          (element) =>
            element.getBoundingClientRect().height > 1 &&
            element.textContent.trim(),
        )
        .map((element) => element.getBoundingClientRect().top),
    );
    const warnings = [];
    if (header && top < header.getBoundingClientRect().bottom)
      warnings.push("chat starts under the side panel header");
    if (bottom > composerTop - 4) warnings.push("chat runs under the composer");
    return warnings;
  });
}

export function askShot(demo) {
  const { ask } = demo;
  return chatShot({
    demo,
    agentId: "ask-agent",
    page: "article",
    prompt: ask.prompt,
    waitFor: lastLine(ask.answer),
    handle: {
      title: ask.chatTitle,
      answer(request, response) {
        const results = toolResults(request);
        if (!results.length)
          return reply(response, request.protocol, {
            calls: [{ id: "call_read", name: "read", args: { source: "tab" } }],
          });
        const id =
          resultText(results.at(-1)).match(/\[\[cite:([^\]]+)\]\]/)?.[1] ||
          "source_1";
        reply(response, request.protocol, {
          text: ask.answer.replaceAll("{cite}", `[[cite:${id}]]`),
        });
      },
      // The composer shows the page attached as context for the next message.
      async afterAnswer(panel) {
        await click(panel, ".composer-left .composer-icon-button");
        await click(
          panel,
          ".add-context-menu .action-list-item:nth-of-type(2)",
        );
        await delay(800);
      },
    },
  });
}

// The snapshot ref of the element described by `role "name"`.
function ref(snapshot, element) {
  const line = snapshot.split("\n").find((item) => item.includes(element));
  const found = line?.slice(line.indexOf(element)).match(/\b(e\d+)\b/)?.[1];
  if (!found) throw new Error(`The page snapshot has no ${element}`);
  return found;
}

export function agentShot(demo) {
  const { agent, booking } = demo;
  return chatShot({
    demo,
    agentId: "general-agent",
    page: "booking",
    prompt: agent.prompt,
    waitFor: booking.submit,
    handle: {
      title: agent.chatTitle,
      answer(request, response) {
        const results = toolResults(request);
        if (!results.length)
          return reply(response, request.protocol, {
            calls: [{ id: "call_snapshot", name: "snapshot", args: {} }],
          });
        if (results.length > 1)
          return reply(response, request.protocol, { text: agent.answer });
        const snapshot = resultText(results[0]);
        const { pick } = agent;
        const steps = [
          {
            action: "type",
            label: `textbox "${booking.name}"`,
            text: pick.name,
          },
          {
            action: "type",
            label: `textbox "${booking.email}"`,
            text: pick.email,
          },
          {
            action: "select",
            label: `combobox "${booking.date}"`,
            value: pick.date,
          },
          {
            action: "select",
            label: `combobox "${booking.party}"`,
            value: pick.party,
          },
          { action: "click", label: `button "${pick.time}"` },
        ].map(({ label, ...step }) => ({ ...step, ref: ref(snapshot, label) }));
        reply(response, request.protocol, {
          calls: [{ id: "call_act", name: "act", args: { steps } }],
        });
      },
    },
  });
}
