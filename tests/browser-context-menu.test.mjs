import assert from "node:assert/strict";
import { test } from "node:test";
import { submitComposer } from "./browser-composer.mjs";
import { poll } from "./chromium.mjs";
import {
  barState,
  clickInBar,
  inSmartBar,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// The right-click menu: the items it registers, the settings that change
// them, and what each item does. Clicks are dispatched to the background's
// own listener with the data Chrome gives it; the side panel is opened first
// with a real click (the smart bar's AI search), as opening it needs one.
const PAGE = `<!doctype html><html lang="en"><title>Menu page</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p{width:420px}</style>
<nav><a href="/elsewhere">Site menu</a></nav>
<main>
  <h1>Release notes</h1>
  <p id="text">The quick brown fox jumps over the lazy dog.</p>
  <p>Read the <a href="/linked">full story</a> for <strong>details</strong>.</p>
</main>`;

const MENU = {
  parent: "oba-menu",
  ask: "oba-ask",
  summarizePage: "oba-summarize-page",
  searchPage: "oba-search-page",
  searchSelection: "oba-search-selection",
  summarizeLink: "oba-summarize-link",
  copyMarkdown: "oba-copy-markdown",
};

test("context menu", { timeout: 240000 }, async (t) => {
  const prompts = [];
  const session = await startSmartBar({
    pages: { "/page": PAGE, "/linked": "<p>Linked</p>" },
    answer: async (prompt, write) => {
      prompts.push(prompt);
      write("Answer from the fixture.");
    },
    smartBar: { enabled: true },
  });
  const { browser, options, extensionUrl, url } = session;
  const pageUrl = url("/page");
  const worker = await browser.attach(
    (item) => item === extensionUrl("background.js"),
    "service_worker",
  );
  // Records what the background creates from now on.
  await worker.call(() => {
    const menus = chrome.contextMenus;
    const create = menus.create.bind(menus);
    const removeAll = menus.removeAll.bind(menus);
    self.menuItems = [];
    menus.create = (properties, callback) =>
      create(properties, () => {
        const error = chrome.runtime.lastError?.message;
        self.menuItems.push({ ...properties, error });
        callback?.();
      });
    menus.removeAll = (...args) => {
      self.menuItems = [];
      return removeAll(...args);
    };
  });
  const menuItems = () => worker.call(() => self.menuItems);
  const setMenu = (contextMenu) =>
    options.call(async (contextMenu) => {
      const { preferences } = await chrome.storage.local.get("preferences");
      await chrome.storage.local.set({
        preferences: { ...preferences, contextMenu },
      });
    }, contextMenu);
  // Agent runs only: chat titles are asked for too.
  const agentPrompts = () =>
    prompts.filter((prompt) => prompt.includes("<message>"));
  const promptCount = () => agentPrompts().length;
  const nextPrompt = async (count) => {
    await poll(() => agentPrompts().length > count, 30000);
    return agentPrompts()[count];
  };
  try {
    const page = await browser.open(pageUrl);
    const tabId = await worker.call(
      async (url) => (await chrome.tabs.query({ url }))[0].id,
      pageUrl,
    );
    const click = (info) =>
      worker.call(
        async ({ info, tabId }) => {
          const tab = await chrome.tabs.get(tabId);
          chrome.contextMenus.onClicked.dispatch(
            { editable: false, frameId: 0, pageUrl: tab.url, ...info },
            tab,
          );
        },
        { info, tabId },
      );

    await t.test("items, titles and contexts", async () => {
      await setMenu({ enabled: true, disabledItems: ["copyMarkdown"] });
      await poll(async () => (await menuItems()).length === 6);
      await setMenu({ enabled: true, disabledItems: [] });
      await poll(async () => (await menuItems()).length === 7);
      const items = await menuItems();
      assert.deepEqual(
        items.map(({ id, parentId, title, contexts, error }) => ({
          id,
          parentId,
          title,
          contexts,
          error,
        })),
        [
          [MENU.parent, undefined, "OpenBrowserAgent", ["all", "tab"]],
          [MENU.ask, "Ask or act on this page", ["all", "tab"]],
          [MENU.summarizePage, "Summarize this page", ["all", "tab"]],
          [
            MENU.searchPage,
            "Search the web about this page",
            [
              "page",
              "frame",
              "link",
              "image",
              "video",
              "audio",
              "editable",
            ].concat("tab"),
          ],
          [MENU.searchSelection, 'Search the web for "%s"', ["selection"]],
          [MENU.summarizeLink, "Summarize linked page", ["link"]],
          [MENU.copyMarkdown, "Copy as Markdown", ["all", "tab"]],
        ].map((entry) =>
          entry.length === 4
            ? {
                id: entry[0],
                parentId: entry[1],
                title: entry[2],
                contexts: entry[3],
                error: undefined,
              }
            : {
                id: entry[0],
                parentId: MENU.parent,
                title: entry[1],
                contexts: entry[2],
                error: undefined,
              },
        ),
      );
    });

    await t.test("titles follow the language setting", async () => {
      await options.call(() => chrome.storage.local.set({ language: "zh-CN" }));
      await poll(async () =>
        (await menuItems()).some((item) => item.title === "总结此页面"),
      );
      await options.call(() => chrome.storage.local.set({ language: "en-US" }));
      await poll(async () =>
        (await menuItems()).some(
          (item) => item.title === "Summarize this page",
        ),
      );
    });

    await t.test("turned off in settings, the menu goes", async () => {
      await setMenu({ enabled: false, disabledItems: [] });
      await poll(async () => (await menuItems()).length === 0);
      await setMenu({ enabled: true, disabledItems: [] });
      await poll(async () => (await menuItems()).length === 7);
    });

    let panel;
    await t.test("smart bar: AI search instead of Summarize", async () => {
      await poll(async () => {
        await selectText(page, "#text");
        return (await barState(page)) === "toolbar";
      });
      assert.deepEqual(
        await inSmartBar(page, (root) =>
          [...root.querySelectorAll('[role="toolbar"] button')]
            .map((button) => button.ariaLabel)
            .filter((label) => label !== "Smart bar options"),
        ),
        ["Ask in side panel", "Explain", "Translate", "AI search", "Copy"],
      );
      const count = promptCount();
      await clickInBar(page, '[aria-label="AI search"]');
      panel = await browser.attach(
        (item) => item === extensionUrl("sidepanel.html"),
      );
      // The prompt is the request's JSON: a newline in it reads "\n".
      const prompt = await nextPrompt(count);
      assert.match(
        prompt,
        /Search the web about the selected text in the message context/,
      );
      assert.match(
        prompt,
        new RegExp(
          `<selected_text>\\\\n<tab_id>${tabId}</tab_id>[\\s\\S]*<text>The quick brown fox jumps over the lazy dog\\.</text>\\\\n</selected_text>`,
        ),
      );
      assert.match(
        prompt,
        /<message>\\nSearch the web about the selected text\\n<\/message>/,
      );
      assert.match(prompt, /Reply in American English\./);
      assert.match(prompt, new RegExp(`<tab_id>${tabId}</tab_id>`));
      // The bubble shows the request; the text is a chip under it.
      assert.deepEqual(
        await poll(() =>
          panel.call(() => {
            const message = [...document.querySelectorAll(".message.user")].at(
              -1,
            );
            const chip = message?.querySelector(".sent-tab-chip[title]");
            return (
              chip && {
                bubble: message.querySelector(".user-bubble").textContent,
                chip: chip.textContent,
                full: chip.getAttribute("title"),
              }
            );
          }),
        ),
        {
          bubble: "Search the web about the selected text",
          chip: "The quick brown fox jumps over the lazy dog.Selected text",
          full: "The quick brown fox jumps over the lazy dog.",
        },
      );
    });

    const requests = [
      [
        "Summarize this page",
        { menuItemId: MENU.summarizePage },
        /Summarize the page the user is viewing \(tab \d+: \W+Menu page\W+ at/,
      ],
      [
        "Search the web about this page",
        { menuItemId: MENU.searchPage },
        /Search the web for information related to the page/,
      ],
      [
        "Search the web for the selection",
        { menuItemId: MENU.searchSelection, selectionText: "lazy dog" },
        /<text>lazy dog<\/text>[\s\S]*Search the web about the selected text in the message context/,
      ],
      [
        "Summarize linked page",
        { menuItemId: MENU.summarizeLink, linkUrl: url("/linked") },
        /Summarize the linked page at http:\/\/127\.0\.0\.1:\d+\/linked/,
      ],
    ];
    for (const [name, info, expected] of requests)
      await t.test(`${name}: sent to the agent at once`, async () => {
        const count = promptCount();
        await click({ parentMenuItemId: MENU.parent, ...info });
        const prompt = await nextPrompt(count);
        assert.match(prompt, expected);
        assert.match(prompt, /<request_instructions>/);
      });

    await t.test(
      "Ask: page and selected text attached, composer empty and focused, nothing sent",
      async () => {
        const count = promptCount();
        await click({
          menuItemId: MENU.ask,
          parentMenuItemId: MENU.parent,
          selectionText: "brown fox",
        });
        const cards = () =>
          panel.call(() =>
            [...document.querySelectorAll(".context-strip .context-card")].map(
              (card) => card.querySelector("strong").textContent,
            ),
          );
        await poll(async () => {
          const ready = await panel.call(
            () =>
              document.activeElement ===
              document.querySelector(".composer-box textarea"),
          );
          return ready && (await cards()).includes("brown fox");
        });
        assert.deepEqual(await cards(), ["Menu page", "brown fox"]);
        assert.equal(
          await panel.call(
            () => document.querySelector(".composer-box textarea").value,
          ),
          "",
        );
        assert.equal(promptCount(), count);

        // Typed and sent: the question, with the text as context.
        await submitComposer(panel, "What is it?");
        const prompt = await nextPrompt(count);
        assert.match(
          prompt,
          /<selected_text>[\s\S]*<text>brown fox<\/text>[\s\S]*<message>\\nWhat is it\?\\n<\/message>/,
        );
        await poll(() =>
          panel.call(
            () =>
              [...document.querySelectorAll(".message.user")]
                .at(-1)
                ?.querySelector(".sent-tab-chip[title]")
                ?.getAttribute("title") === "brown fox",
          ),
        );
        assert.equal(
          await panel.call(
            () =>
              document.querySelectorAll(".context-strip .context-card").length,
          ),
          0,
        );
      },
    );

    await t.test(
      "Copy as Markdown puts Markdown on the clipboard",
      async () => {
        const origin = new URL(pageUrl).origin;
        await browser.browser.send("Browser.grantPermissions", {
          origin,
          permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
        });
        await page.send("Page.bringToFront");
        // The right-click the menu came from.
        for (const type of ["mousePressed", "mouseReleased"])
          await page.send("Input.dispatchMouseEvent", {
            type,
            x: 30,
            y: 200,
            button: "right",
            clickCount: 1,
          });
        await click({
          menuItemId: MENU.copyMarkdown,
          parentMenuItemId: MENU.parent,
        });
        const text = await poll(async () => {
          const value = await page.call(() =>
            navigator.clipboard.readText().catch(() => ""),
          );
          return value.includes("Release notes") && value;
        });
        assert.equal(
          text,
          `# Release notes\n\n<${pageUrl}>\n\nThe quick brown fox jumps over the lazy dog.\n\nRead the [full story](${origin}/linked) for **details**.`,
        );
        await poll(async () => {
          const { root } = await page.send("DOM.getDocument", {
            depth: -1,
            pierce: true,
          });
          return JSON.stringify(root).includes("Copied as Markdown");
        });
      },
    );

    await t.test("Copy as Markdown says so where it can't copy", async () => {
      const other = await browser.open("chrome://version/");
      const otherId = await worker.call(
        async () =>
          (await chrome.tabs.query({ url: "chrome://version/" }))[0].id,
      );
      await worker.call(async (tabId) => {
        const tab = await chrome.tabs.get(tabId);
        chrome.contextMenus.onClicked.dispatch(
          {
            menuItemId: "oba-copy-markdown",
            parentMenuItemId: "oba-menu",
            editable: false,
            frameId: 0,
            pageUrl: tab.url,
          },
          tab,
        );
      }, otherId);
      await poll(() =>
        worker.call(
          async (tabId) =>
            (await chrome.action.getBadgeText({ tabId })) === "!" &&
            (await chrome.action.getTitle({ tabId })).includes(
              "Can't copy this page",
            ),
          otherId,
        ),
      );
      other.close();
    });
  } finally {
    await session.close();
  }
});
