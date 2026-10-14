import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// read fetches web pages without opening tabs; tabs the agent opens land in
// the chat's tab group and the user's own tabs stay as they are.
const ARTICLE = `<!doctype html><html><head><title>Pelicans at dawn</title>
<script>fetch("/script-ran"); document.title = "Script ran";</script></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<div class="language-picker">English Deutsch</div>
<main><article><h1>Pelicans at dawn</h1>
<p>Brown pelicans dive from up to twenty metres to catch fish near the surface. They fold their wings just before they hit the water, which protects their bodies.</p>
<p>Read the <a href="/guide">field guide</a> for more. <img src="/image-loaded" alt="A pelican diving"></p>
<ul><li>Wingspan: two metres</li><li>Weight: up to five kilograms</li></ul>
<script>document.write("SCRIPT TEXT WRITTEN")</script>
</article></main><footer>Copyright footer</footer></body></html>`;

const APP = `<!doctype html><html><head><title>App</title></head>
<body><div id="root"></div><noscript>You need to enable JavaScript.</noscript>
<script src="/bundle.js"></script></body></html>`;

test(
  "read and agent tabs: URL pages as text, one group per chat, user tabs untouched",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const hits = [];
    const fixture = await browserToolFixture((request, response) => {
      hits.push({ url: request.url, cookie: request.headers.cookie });
      if (request.url === "/login") {
        response
          .writeHead(200, {
            "Content-Type": "text/html",
            "Set-Cookie": "session=secret; Path=/",
          })
          .end("<title>Login</title><p>Signed in</p>");
        return true;
      }
      const pages = {
        "/article": ARTICLE,
        "/app": APP,
        "/latin": Buffer.from(
          `<title>Caf\u00e9</title><p>${"Un caf\u00e9 cr\u00e8me, s'il vous pla\u00eet. ".repeat(8)}</p>`,
          "latin1",
        ),
        "/a": "<title>Page A</title><p>A</p>",
        "/b": "<title>Page B</title><p>B</p>",
        "/c": "<title>Page C</title><p>C</p>",
        "/mine":
          '<title>User tab</title><p>Mine</p><a href="/c" target="_blank">Open C</a>',
      };
      if (!pages[request.url]) return false;
      response
        .writeHead(200, {
          "Content-Type":
            request.url === "/latin"
              ? "text/html; charset=iso-8859-1"
              : "text/html",
        })
        .end(pages[request.url]);
      return true;
    });
    const { page, baseUrl } = fixture;
    const tabIds = () =>
      page.call(async () => (await chrome.tabs.query({})).map((tab) => tab.id));
    try {
      const userTab = await fixture.open("/mine");
      await fixture.open("/login");

      await t.test("read returns a page's text without a tab", async () => {
        const before = await tabIds();
        const [article, app, latin] = await fixture.run([
          { name: "read", args: { source: `${baseUrl}/article` } },
          { name: "read", args: { source: `${baseUrl}/app` } },
          { name: "read", args: { source: `${baseUrl}/latin` } },
        ]);
        assert.deepEqual(await tabIds(), before);
        assert.match(
          article,
          /^\[Pelicans at dawn \| http:\/\/127\.0\.0\.1:\d+\/article \| characters 0-\d+ of \d+; end\]/,
        );
        assert.match(article, /# Pelicans at dawn/);
        assert.match(article, /Brown pelicans dive from up to twenty metres/);
        assert.match(
          article,
          /Read the \[field guide\]\(\/guide\) for more\. \[image: A pelican diving\]/,
        );
        assert.match(
          article,
          /- Wingspan: two metres\n\n- Weight: up to five kilograms/,
        );
        assert.doesNotMatch(
          article,
          /Home|Deutsch|Copyright footer|SCRIPT TEXT|Script ran|Only \d+ characters/,
        );
        assert.match(
          app,
          /Only 0 characters of text in the fetched HTML: the page may need JavaScript, a login or a bot check\. Open it with tabs/,
        );
        assert.match(latin, /Un café crème, s'il vous plaît\./);
        // Scripts did not run, images did not load, and the site's cookies were
        // sent as a tab would send them.
        const urls = hits.map((hit) => hit.url);
        for (const url of ["/script-ran", "/image-loaded", "/bundle.js"])
          assert.ok(!urls.includes(url), `${url} was requested`);
        const read = hits.filter((hit) => hit.url === "/article");
        assert.equal(read.length, 1);
        assert.equal(read[0].cookie, "session=secret");
      });

      await t.test("tabs a chat opens share its group", async () => {
        const [first, second, list] = await fixture.run([
          {
            name: "tabs",
            args: { action: "open", url: `${baseUrl}/a`, show: true },
          },
          { name: "tabs", args: { action: "open", url: `${baseUrl}/b` } },
          { name: "tabs", args: { action: "list" } },
        ]);
        const tabId = (text) => Number(text.match(/tab (\d+)/)[1]);
        const tabs = await page.call(
          async (ids) =>
            Promise.all(
              ids.map(async (id) => {
                const tab = await chrome.tabs.get(id);
                const group =
                  tab.groupId === -1
                    ? undefined
                    : await chrome.tabGroups.get(tab.groupId);
                return { id, groupId: tab.groupId, title: group?.title };
              }),
            ),
          [tabId(first), tabId(second), userTab],
        );
        const [a, b, mine] = tabs;
        assert.notEqual(a.groupId, -1);
        assert.equal(b.groupId, a.groupId);
        assert.equal(a.title, "OpenBrowserAgent");
        assert.match(
          first,
          /^Opened tab \d+ \(active, opened by you\) \[group: OpenBrowserAgent\]: Page A/,
        );
        assert.equal(mine.groupId, -1);
        assert.match(
          list,
          new RegExp(
            `tab ${a.id} \\(active, opened by you\\) \\[group: OpenBrowserAgent\\]`,
          ),
        );
        assert.match(
          list,
          new RegExp(
            `tab ${b.id} \\(working tab, opened by you\\) \\[group: OpenBrowserAgent\\]`,
          ),
        );
        assert.match(list, new RegExp(`tab ${userTab}: User tab`));
      });

      await t.test("a tab a click opens joins the group", async () => {
        // Real input goes to the visible tab.
        await page.call(
          (id) => chrome.tabs.update(id, { active: true }),
          userTab,
        );
        const [snapshot] = await fixture.run([
          { name: "snapshot", args: { tabId: userTab } },
        ]);
        const [acted] = await fixture.run([
          {
            name: "act",
            args: {
              tabId: userTab,
              steps: [
                {
                  action: "click",
                  ref: ref(snapshot, "Open C"),
                  trusted: true,
                },
              ],
            },
          },
        ]);
        const opened = Number(acted.match(/Opened new tab (\d+)/)[1]);
        assert.match(acted, /Opened new tab \d+ \(active, opened by you\)/);
        const [tab, mine] = await page.call(
          (ids) => Promise.all(ids.map((id) => chrome.tabs.get(id))),
          [opened, userTab],
        );
        assert.notEqual(tab.groupId, -1);
        assert.equal(mine.groupId, -1);
      });
    } finally {
      await fixture.close();
    }
  },
);
