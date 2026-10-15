import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { UI_STATE } from "../src/ui/ui-state.ts";
import { setPreferences } from "./browser-harness.mjs";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { poll } from "./chromium.mjs";
import { sendComposer, typeComposer } from "./browser-composer.mjs";

// Real Chromium downloads files from a local server: the files on disk, the
// outcomes the agent reads and the side panel's step line are all checked.

const PDF = Buffer.from("%PDF-1.4\n% fixture report\n%%EOF\n");
const SHEET = Buffer.from("PK\u0003\u0004 fixture sheet bytes");
const CSV = "id,total\n1,42\n";
const BIG = Buffer.alloc(400_000, 7);

const PAGE = `<title>Downloads fixture</title>
<a href="/cd/invoice" download>Get invoice</a>
<button onclick="setTimeout(() => { location.href = '/slow-file' }, 1200)">Export later</button>`;

function serve(state) {
  return (request, response) => {
    const url = new URL(request.url, "http://fixture");
    const file = (type, body, headers = {}) =>
      response
        .writeHead(200, {
          "Content-Type": type,
          "Content-Length": body.length,
          ...headers,
        })
        .end(body);
    switch (url.pathname) {
      case "/page":
        response.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
        return true;
      case "/login":
        response
          .writeHead(200, {
            "Content-Type": "text/html",
            "Set-Cookie": "session=ok; Path=/; SameSite=Lax",
          })
          .end("<title>Signed in</title><p>Signed in</p>");
        return true;
      case "/protected/data.csv":
        if (!/(^|;\s*)session=ok/.test(request.headers.cookie || "")) {
          response.writeHead(403).end("forbidden");
          return true;
        }
        file("text/csv", Buffer.from(CSV));
        return true;
      case "/files/report.pdf":
        file("application/pdf", PDF);
        return true;
      case "/redirect":
        response.writeHead(302, { Location: "/files/report.pdf" }).end();
        return true;
      case "/cd/sheet":
      case "/cd/invoice":
        file("application/octet-stream", SHEET, {
          "Content-Disposition": `attachment; filename="${url.pathname === "/cd/sheet" ? "Quarterly Report.xlsx" : "invoice-7.xlsx"}"`,
        });
        return true;
      case "/login-wall.pdf":
        file("text/html", Buffer.from("<title>Sign in</title><form></form>"));
        return true;
      case "/slow-file":
        setTimeout(
          () =>
            file("text/csv", Buffer.from(CSV), {
              "Content-Disposition": 'attachment; filename="later.csv"',
            }),
          800,
        );
        return true;
      case "/drop":
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": BIG.length,
          "Content-Disposition": 'attachment; filename="dropped.bin"',
        });
        response.write(BIG.subarray(0, 1000));
        setTimeout(() => response.socket.destroy(), 100);
        return true;
      case "/flaky":
        state.flaky = (state.flaky || 0) + 1;
        if (state.flaky === 1) response.writeHead(503).end("busy");
        else
          file("application/octet-stream", BIG, {
            "Content-Disposition": 'attachment; filename="flaky.bin"',
          });
        return true;
      case "/endless": {
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": 50_000_000,
          "Content-Disposition": 'attachment; filename="endless.bin"',
        });
        const timer = setInterval(
          () => response.write(BIG.subarray(0, 1000)),
          100,
        );
        response.on("close", () => clearInterval(timer));
        return true;
      }
    }
    return false;
  };
}

const LOAD = {
  name: "toolSearch",
  args: { names: ["downloads", "workspace"] },
};
const TITLE_REQUEST = "Create concise chat titles";
const path = (text) => text.match(/saved at (.+?)\.(?: From| To read|$)/m)?.[1];
const id = (text) => Number(text.match(/#(\d+) /)?.[1]);
const toolTexts = (body) =>
  body.messages
    .filter((message) => message.role === "tool")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text || "").join(""),
    );

// Answers by how many tool results the chat has, so a step may use the
// results before it (as a function of their texts).
const stepper = (steps) => (body) => {
  if (JSON.stringify(body).includes(TITLE_REQUEST))
    return { text: "Downloads" };
  const texts = toolTexts(body);
  const step = steps[texts.length];
  if (!step) return { text: "Fixture complete." };
  const call = typeof step === "function" ? step(texts.slice(1)) : step;
  return {
    calls: [{ id: `tool-${texts.length}`, name: call.name, args: call.args }],
  };
};

const download = (args) => ({
  name: "downloads",
  args: { action: "download", ...args },
});
const downloads = (action, args = {}) => ({
  name: "downloads",
  args: { action, ...args },
});

test(
  "downloads: URLs, saved content, waits and the step line",
  { timeout: 300000 },
  async (t) => {
    const state = {};
    // The browser's own download folder: a CDP download override would put
    // every file at the top of its folder under a name of its own.
    const folder = await mkdtemp(join(tmpdir(), "oba-downloads-"));
    const fixture = await browserToolFixture(serve(state), {
      preferences: {
        download: { default_directory: folder, prompt_for_download: false },
      },
    });
    await fixture.browser.browser.send("Browser.setDownloadBehavior", {
      behavior: "default",
    });
    const { page, baseUrl, open } = fixture;
    const run = async (steps) =>
      (await fixture.run(stepper([LOAD, ...steps]))).slice(1);
    try {
      await t.test(
        "a file behind the user's sign-in downloads with their cookies",
        async () => {
          const [denied] = await run([
            download({ url: `${baseUrl}/protected/data.csv` }),
          ]);
          assert.match(
            denied,
            /failed: the server refused access \(HTTP 403\)\. \[SERVER_FORBIDDEN\]|failed: the server refused access \(HTTP 403\) \[SERVER_FORBIDDEN\]/,
          );
          await open("/login");
          const [text] = await run([
            download({
              url: `${baseUrl}/protected/data.csv`,
              filename: "../../etc/data.csv",
            }),
          ]);
          assert.match(text, /completed, 14 B \(text\/csv\), saved at /);
          const saved = path(text);
          assert.ok(saved.startsWith(folder), saved);
          assert.match(saved, /\/etc\/data\.csv$/);
          assert.equal(await readFile(saved, "utf8"), CSV);
        },
      );

      await t.test(
        "redirects are followed and the server's file name is kept",
        async () => {
          const [redirected, named, foldered, wall] = await run([
            download({ url: `${baseUrl}/redirect` }),
            download({ url: `${baseUrl}/cd/sheet` }),
            download({ url: `${baseUrl}/cd/sheet`, folder: "reports" }),
            download({ url: `${baseUrl}/login-wall.pdf` }),
          ]);
          assert.match(redirected, /redirected to .*\/files\/report\.pdf/);
          assert.deepEqual(await readFile(path(redirected)), PDF);
          assert.match(path(named), /\/Quarterly Report\.xlsx$/);
          assert.deepEqual(await readFile(path(named)), SHEET);
          assert.match(path(foldered), /\/reports\/Quarterly Report\.xlsx$/);
          assert.match(
            wall,
            /the server sent a web page \(text\/html\), not the file/,
          );
        },
      );

      await t.test(
        "a click's download is reported with the step, a later one is waited for",
        async () => {
          const tabId = await open("/page");
          const [snapshot] = await run([{ name: "snapshot", args: { tabId } }]);
          const [clicked, none] = await run([
            {
              name: "act",
              args: {
                tabId,
                steps: [{ action: "click", ref: ref(snapshot, "Get invoice") }],
              },
            },
            downloads("wait", { timeoutSeconds: 2 }),
          ]);
          assert.match(
            clicked,
            /Started a download:\n#\d+ invoice-7\.xlsx: completed/,
          );
          assert.deepEqual(await readFile(path(clicked)), SHEET);
          // The invoice's outcome was reported, so wait looks for a new one.
          assert.match(none, /No download started within 2 s/);
          const [later, next] = await run([
            {
              name: "act",
              args: {
                tabId,
                steps: [
                  { action: "click", ref: ref(snapshot, "Export later") },
                ],
              },
            },
            downloads("wait", { timeoutSeconds: 20 }),
          ]);
          assert.doesNotMatch(later, /Started a download/);
          assert.match(next, /#\d+ later\.csv: completed/);
          assert.equal(await readFile(path(next), "utf8"), CSV);
        },
      );

      await t.test(
        "failures say why; retry starts it again; cancel stops it",
        async () => {
          const [missing, dropped] = await run([
            download({ url: `${baseUrl}/missing.zip` }),
            download({ url: `${baseUrl}/drop` }),
          ]);
          assert.match(
            missing,
            /failed: the server has no such file .*\[SERVER_BAD_CONTENT\]/,
          );
          assert.match(dropped, /dropped\.bin: failed: .*\[[A-Z_]+\]/);
          state.flaky = 0;
          const [flaky, retried] = await run([
            download({ url: `${baseUrl}/flaky` }),
            (texts) => downloads("retry", { id: id(texts[0]) }),
          ]);
          assert.match(flaky, /failed/);
          assert.match(retried, /flaky\.bin: completed, 390\.6 KB/);
          assert.equal((await readFile(path(retried))).length, BIG.length);
          const [foreign] = await run([downloads("cancel", { id: id(flaky) })]);
          assert.match(foreign, /was not started by you in this chat/);
          const [started, canceled] = await run([
            download({ url: `${baseUrl}/endless`, timeoutSeconds: 1 }),
            (texts) => downloads("cancel", { id: id(texts[0]) }),
          ]);
          assert.match(
            started,
            /still downloading, .* of 47\.7 MB \(\d+%\)\. Call downloads wait with id \d+/,
          );
          assert.match(canceled, /endless\.bin: canceled; nothing was saved/);
        },
      );

      await t.test(
        "text, bytes and workspace files are saved as files",
        async () => {
          await page.call(async () => {
            const { agents } = await chrome.storage.local.get("agents");
            await chrome.storage.local.set({
              agents: agents.map((agent) => ({ ...agent, workspace: true })),
            });
          });
          const [csv, png, , note, list] = await run([
            downloads("save", {
              content: "name,city\nMara,Zürich\n",
              filename: "people.csv",
              folder: "agent",
            }),
            downloads("save", {
              content: "iVBORw0KGgo=",
              encoding: "base64",
              filename: "pixel",
              mimeType: "image/png",
            }),
            {
              name: "workspace",
              args: {
                action: "write",
                path: "notes/plan.md",
                content: "# Plan\n\nShip it.\n",
              },
            },
            downloads("save", { source: "workspace:notes/plan.md" }),
            downloads("list", { limit: 3 }),
          ]);
          assert.match(path(csv), /\/agent\/people\.csv$/);
          assert.equal(
            await readFile(path(csv), "utf8"),
            "\ufeffname,city\nMara,Zürich\n",
          );
          assert.match(path(png), /\/pixel\.png$/);
          assert.deepEqual(
            await readFile(path(png)),
            Buffer.from("iVBORw0KGgo=", "base64"),
          );
          assert.match(path(note), /\/plan\.md$/);
          assert.equal(
            await readFile(path(note), "utf8"),
            "# Plan\n\nShip it.\n",
          );
          assert.match(
            list,
            /^3 most recent downloads:\n#\d+ plan\.md: completed/,
          );
          assert.doesNotMatch(list.split("\n")[1], /not started by you/);
        },
      );

      await t.test(
        "the side panel shows the outcome and shows the file in its folder",
        async () => {
          const panel = await fixture.browser.open(
            `chrome-extension://${fixture.browser.id}/sidepanel.html`,
          );
          await setPreferences(panel, {
            selectedModelId: "fixture",
            selectedAgentId: "fixture-agent",
            autoRetry: false,
          });
          await panel.call(async () => {
            await chrome.storage.local.set({ language: "en-US" });
          });
          await panel.send("Page.reload");
          await poll(
            () =>
              panel.call(
                () => !!document.querySelector(".composer-box textarea"),
              ),
            30000,
          );
          const tabId = await open("/page");
          const [snapshot] = await run([{ name: "snapshot", args: { tabId } }]);
          fixture.script(
            stepper([
              LOAD,
              downloads("save", { content: CSV, filename: "totals.csv" }),
              download({ url: `${baseUrl}/missing.zip` }),
              {
                name: "act",
                args: {
                  tabId,
                  steps: [
                    { action: "click", ref: ref(snapshot, "Get invoice") },
                  ],
                },
              },
            ]),
          );
          await typeComposer(panel, "Save the totals");
          await sendComposer(panel);
          await poll(
            () =>
              panel.call(() =>
                document.body.innerText.includes("Fixture complete."),
              ),
            60000,
          );
          const button = 'button[aria-label="Show totals.csv in its folder"]';
          await poll(() =>
            panel.call(
              (selector) => !!document.querySelector(selector),
              button,
            ),
          );
          const lines = await panel.call(
            (errorState) =>
              // A failed step is styled like any failed step.
              [...document.querySelectorAll(".tool-card")].map(
                (card) =>
                  `${card.dataset.state === errorState ? "[failed] " : ""}${card.innerText.replace(/\s+/g, " ").trim()}`,
              ),
            UI_STATE.error,
          );
          assert.ok(
            lines.some((line) =>
              /^Saved totals\.csv · 14 bytes totals\.csv$/.test(line),
            ),
            lines.join("\n"),
          );
          assert.ok(
            lines.some((line) =>
              /^\[failed\] Download failed missing\.zip: the file isn't on the server$/.test(
                line,
              ),
            ),
            lines.join("\n"),
          );
          const shown = await panel.call(async (selector) => {
            let shown;
            chrome.downloads.show = (id) => {
              shown = id;
            };
            document.querySelector(selector).click();
            const [item] = await chrome.downloads.search({ id: shown });
            return item?.filename;
          }, button);
          assert.match(shown, /\/totals\.csv$/);
          // The act step names what it did and links the file its click
          // downloaded.
          const actCard = await poll(() =>
            panel.call(() => {
              const card = [...document.querySelectorAll(".tool-card")].find(
                (item) =>
                  item.querySelector('button[aria-label^="Show invoice-7"]'),
              );
              return card?.innerText.replace(/\s+/g, " ").trim();
            }),
          );
          assert.match(actCard, /Clicked 1 element/i);
          assert.doesNotMatch(actCard, /\bclick\b|Tab \d/);
          await delay(100);
        },
      );
    } finally {
      await fixture.close();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
