import { poll } from "./chromium.mjs";
import { startSmartBar } from "./smart-bar-page.mjs";

// Test helpers for page translation: the production build in Chromium with
// a fixture server for pages and the model, the background's worker, and
// right-click menu clicks dispatched to the background's own listener.

export const MENU_ID = "oba-translate-page";

// A long article: links, emphasis and code in its paragraphs, a list, a code
// block, form fields, text marked not to translate, and a button that adds a
// paragraph later. `paragraphs`: how many numbered paragraphs follow.
export function articlePage({ paragraphs = 60, dark = false } = {}) {
  const numbered = Array.from(
    { length: paragraphs },
    (_, index) =>
      `<p id="p${index + 1}">Paragraph number ${index + 1} talks about the weather in the mountains.</p>`,
  ).join("\n");
  return `<!doctype html><html lang="en"><head><title>Field notes</title>
<style>
body{font:17px/1.6 Georgia,serif;margin:24px auto;max-width:640px;padding:0 16px;${
    dark ? "background:#14161a;color:#e6e6e6" : "background:#fff;color:#1d1d1f"
  }}
a{color:${dark ? "#8ab4f8" : "#0b57d0"}}
pre,code{font-family:monospace;background:${dark ? "#23262d" : "#f2f2f2"}}
nav{display:flex;gap:16px}
</style></head><body>
<nav><a href="/home">Home</a><a href="/about">About us</a></nav>
<article>
<h1 id="title">Notes from the field</h1>
<p id="intro">Read the <a id="intro-link" href="/guide">field guide</a> before you <strong>leave the trail</strong>, and run <code>check-gear</code> first.</p>
<ul id="list"><li>Bring enough water for the day.</li><li>Tell someone where you are going.</li></ul>
<pre id="code">const trail = "do not translate this code";</pre>
<p id="skip" translate="no">This sentence must stay as it is.</p>
<label id="label">Your name <input id="name" value="Keep this value"></label>
<textarea id="notes">Keep these notes</textarea>
<button id="add" onclick="const p=document.createElement('p');p.id='dynamic';p.textContent='A paragraph that appeared later.';document.getElementById('intro').after(p)">Add a paragraph</button>
${numbered}
</article>
</body></html>`;
}

// Translates like a model: every [[n]] item comes back prefixed with "FR:",
// markers kept. Titles and other requests get a short answer.
export function fixtureTranslator(log = []) {
  return async (prompt, write) => {
    const messages = JSON.parse(prompt);
    const user = messages.find((message) => message.role === "user");
    const content =
      typeof user?.content === "string"
        ? user.content
        : (user?.content || []).map((part) => part.text || "").join("");
    if (!content.includes("[[end]]")) return write("Title");
    const items = [...content.matchAll(/^\[\[(\d+)\]\]\n(.*)$/gm)];
    log.push(items.map(([, , text]) => text));
    for (const [, id, text] of items) write(`[[${id}]]\nFR: ${text}\n`);
    write("[[end]]");
  };
}

export async function startPageTranslate({
  pages,
  answer,
  preferences,
  launch,
}) {
  const session = await startSmartBar({ pages, answer, launch });
  const { browser, options, extensionUrl } = session;
  if (preferences)
    await options.call(async (change) => {
      const { preferences } = await chrome.storage.local.get("preferences");
      await chrome.storage.local.set({
        preferences: { ...preferences, ...change },
      });
    }, preferences);
  const attachWorker = async () => {
    const worker = await browser.attach(
      (item) => item === extensionUrl("background.js"),
      "service_worker",
    );
    // The menu is built when the extension is installed.
    await poll(() =>
      worker.call(
        () =>
          new Promise((resolve) =>
            chrome.contextMenus.update("oba-translate-page", {}, () =>
              resolve(!chrome.runtime.lastError),
            ),
          ),
      ),
    );
    // Records the titles the menu item gets.
    await worker.call(() => {
      const menus = chrome.contextMenus;
      const update = menus.update.bind(menus);
      self.menuTitles = [];
      menus.update = (id, properties, callback) => {
        if (id === "oba-translate-page") self.menuTitles.push(properties.title);
        return update(id, properties, callback);
      };
    });
    const tabIdOf = (url) =>
      poll(() =>
        worker.call(
          async (url) => (await chrome.tabs.query({ url }))[0]?.id,
          url,
        ),
      );
    return {
      worker,
      // The menu item clicked on the tab showing `url`.
      clickMenu: async (url) => {
        const tabId = await tabIdOf(url);
        await worker.call(
          async ({ tabId, menuItemId }) => {
            const tab = await chrome.tabs.get(tabId);
            chrome.contextMenus.onClicked.dispatch(
              {
                menuItemId,
                parentMenuItemId: "oba-menu",
                editable: false,
                frameId: 0,
                pageUrl: tab.url,
              },
              tab,
            );
          },
          { tabId, menuItemId: MENU_ID },
        );
      },
      menuTitles: () => worker.call(() => self.menuTitles),
    };
  };
  const current = await attachWorker();
  // Reloads the extension as an update does; its pages close, tabs stay.
  // Returns the new worker's helpers.
  const reloadExtension = async () => {
    const workers = async () =>
      (await browser.targets()).filter(
        (item) =>
          item.type === "service_worker" &&
          item.url === extensionUrl("background.js"),
      );
    const [before] = await workers();
    await current.worker
      .call(() => setTimeout(() => chrome.runtime.reload(), 50))
      .catch(() => undefined);
    await poll(async () => {
      const [after] = await workers();
      return after && after.id !== before.id;
    });
    return attachWorker();
  };
  const setPreferences = (change) =>
    options.call(async (change) => {
      const { preferences } = await chrome.storage.local.get("preferences");
      await chrome.storage.local.set({
        preferences: {
          ...preferences,
          pageTranslate: { ...preferences.pageTranslate, ...change },
        },
      });
    }, change);
  return { ...session, ...current, setPreferences, reloadExtension };
}

// The translation shown in the block `selector`, or undefined.
export function translationIn(page, selector) {
  return page.call(
    (selector) =>
      document.querySelector(`${selector} > oba-translation`)?.textContent,
    selector,
  );
}

// The page's own markup, without our nodes.
export function pageHtml(page) {
  return page.call(() => document.documentElement.outerHTML);
}
