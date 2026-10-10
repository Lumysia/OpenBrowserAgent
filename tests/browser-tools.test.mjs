import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { browserToolFixture } from "./browser-tool-fixture.mjs";
import { poll } from "./chromium.mjs";
import { checkSelectorTheme } from "./browser-selector.mjs";
import { checkCdpLifecycle } from "./browser-cdp-lifecycle.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
test(
  "production browser tools honor display/input contracts and cancellation",
  { timeout: 120000 },
  async (t) => {
    const slow = new Map();
    let slowDownloads = false;
    let imageRequests = 0;
    let completeGeneration = false;
    const fixture = await browserToolFixture((request, response) => {
      if (completeGeneration && request.url === "/v1/images/generations") {
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }),
          );
        return true;
      }
      if (
        ["/slow-file", "/v1/images/generations", "/v1/images/edits"].includes(
          request.url,
        ) ||
        (slowDownloads && request.url === "/image.png")
      ) {
        const entry = { response, closed: false };
        slow.set(request.url, entry);
        response.on("close", () => {
          entry.closed = true;
        });
        response.writeHead(200, {
          "Content-Type": request.url.startsWith("/v1/")
            ? "application/json"
            : "image/png",
        });
        response.flushHeaders();
        return true;
      }
      if (request.url === "/image.png" || request.url === "/second.png") {
        imageRequests++;
        response.writeHead(200, { "Content-Type": "image/png" }).end(png);
        return true;
      }
      if (request.url === "/page") {
        response
          .writeHead(200, { "Content-Type": "text/html" })
          .end(
            '<meta name="viewport" content="width=device-width"><title>OBA tool fixture</title><style>body{height:2600px}.bg{width:30px;height:30px;background-image:url(/second.png)}</style><input id="input" data-ai-id="fixture-input" value="replace me"><button id="target">Target</button><img src="/image.png"><div class="bg"></div>',
          );
        return true;
      }
    });
    const { page } = fixture;
    try {
      const tab = await page.call(
        (url) => chrome.tabs.create({ url }),
        `${fixture.baseUrl}/page`,
      );
      await poll(() =>
        page.call(
          async (id) => (await chrome.tabs.get(id)).status === "complete",
          tab.id,
        ),
      );
      const load = (names) => ({ name: "loadTools", args: { names } });
      const cdp = (operation, args = {}) => ({
        name: "cdpPage",
        args: { tabId: tab.id, operation, ...args },
      });
      const evaluate = (fn) => ({
        name: "cdpEvaluateScript",
        args: { tabId: tab.id, function: fn },
      });

      await t.test(
        "screenshots, persistent emulation, reset and keyboard shortcuts",
        async () => {
          const results = await fixture.run([
            load([
              "cdpTakeScreenshot",
              "cdpPage",
              "cdpEvaluateScript",
              "cdpInput",
            ]),
            {
              name: "captureVisibleTab",
              args: { tabId: tab.id, format: "png" },
            },
            {
              name: "cdpTakeScreenshot",
              args: { tabId: tab.id, format: "png", fullPage: true },
            },
            cdp("emulate", {
              viewport: "390x844x2,mobile",
              colorScheme: "dark",
              userAgent: "OpenBrowserAgent fixture",
            }),
            evaluate(
              '()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,dark:matchMedia("(prefers-color-scheme: dark)").matches,ua:navigator.userAgent})',
            ),
            cdp("emulate", { reset: true }),
            evaluate(
              "()=>({width:innerWidth,dpr:devicePixelRatio,ua:navigator.userAgent})",
            ),
            {
              name: "mutatePage",
              args: {
                tabId: tab.id,
                operation: "click",
                target: { selector: "#input" },
              },
            },
            {
              name: "cdpInput",
              args: { tabId: tab.id, operation: "key", key: "Control+A" },
            },
            {
              name: "cdpInput",
              args: { tabId: tab.id, operation: "type", text: "replacement" },
            },
            evaluate('()=>document.querySelector("#input").value'),
            {
              name: "inspectPage",
              args: {
                tabId: tab.id,
                target: { selector: "#target" },
                include: ["elements"],
                waitFor: { selector: "#target" },
              },
            },
          ]);
          const output = (index) => results[index].output;
          for (const item of results)
            assert.equal(
              item.output.error,
              undefined,
              `${item.name}: ${item.output.error}`,
            );
          const dimensions = (data) => {
            const bytes = Buffer.from(data.split(",")[1], "base64");
            return {
              width: bytes.readUInt32BE(16),
              height: bytes.readUInt32BE(20),
            };
          };
          const visible = dimensions(output(1).image);
          const full = dimensions(output(2).image);
          assert.ok(full.height >= 2600);
          assert.ok(full.height > visible.height);
          assert.deepEqual(output(4).result, {
            width: 390,
            height: 844,
            dpr: 2,
            dark: true,
            ua: "OpenBrowserAgent fixture",
          });
          assert.notEqual(output(6).result.width, 390);
          assert.equal(output(6).result.dpr, 1);
          assert.notEqual(output(6).result.ua, "OpenBrowserAgent fixture");
          assert.equal(output(10).result, "replacement");
          assert.equal(output(11).pages[0].targetFound, true);
          console.log(
            JSON.stringify({
              visible,
              full,
              emulation: output(4).result,
              shortcutValue: output(10).result,
            }),
          );
        },
      );

      await checkCdpLifecycle(t, fixture, tab);

      await t.test(
        "ZIP and Markdown exports complete and contain the requested data",
        async () => {
          const results = await fixture.run([
            { name: "downloadAllImagesInTab", args: { tabId: tab.id } },
            { name: "downloadTabToMarkdown", args: { tabId: tab.id } },
            {
              name: "readFileFromUrl",
              args: { url: `${fixture.baseUrl}/image.png` },
            },
          ]);
          assert.equal(results[0].output.downloadedCount, 2);
          assert.equal(results[1].output.success, true);
          assert.equal(results[2].output.visionImageAttached, true);
          const downloads = await page.call(() => chrome.downloads.search({}));
          const zipFile = downloads.find((item) =>
            item.filename.endsWith(".zip"),
          );
          const markdown = downloads.find((item) =>
            item.filename.endsWith(".md"),
          );
          assert.equal(zipFile.state, "complete");
          assert.equal(markdown.state, "complete");
          for (const item of [zipFile, markdown])
            assert.ok(item.filename.startsWith(fixture.browser.profile + "/"));
          const zip = await JSZip.loadAsync(await readFile(zipFile.filename));
          assert.equal(Object.keys(zip.files).length, 2);
          for (const file of Object.values(zip.files))
            assert.deepEqual(await file.async("nodebuffer"), png);
          assert.match(
            await readFile(markdown.filename, "utf8"),
            /OBA tool fixture/,
          );
          console.log(
            "Production ZIP: two correct image entries; Markdown and URL vision read passed.",
          );
        },
      );

      await t.test(
        "generated image persists byte-correctly in production IndexedDB",
        async () => {
          completeGeneration = true;
          const [result] = await fixture.run([
            { name: "generateImage", args: { prompt: "fixture" } },
          ]);
          completeGeneration = false;
          assert.equal(result.output.imageStored, true);
          const bytes = await page.call(async (id) => {
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open(
                "openbrowseragent-chat-attachments",
                1,
              );
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              return await new Promise((resolve, reject) => {
                const request = db
                  .transaction("attachments")
                  .objectStore("attachments")
                  .get(id);
                request.onsuccess = () =>
                  resolve(Array.from(request.result.content));
                request.onerror = () => reject(request.error);
              });
            } finally {
              db.close();
            }
          }, result.output.imageAttachmentId);
          assert.deepEqual(Buffer.from(bytes), png);
        },
      );

      for (const name of [
        "readFileFromUrl",
        "generateImage",
        "downloadAllImagesInTab",
      ])
        await t.test(
          `stop cancels active ${name} network work and later tool effects`,
          async () => {
            const endpoint =
              name === "generateImage"
                ? "/v1/images/generations"
                : name === "downloadAllImagesInTab"
                  ? "/image.png"
                  : "/slow-file";
            slow.delete(endpoint);
            slowDownloads = name === "downloadAllImagesInTab";
            const beforeDownloads = await page.call(
              async () => (await chrome.downloads.search({})).length,
            );
            const beforeImages = imageRequests;
            await fixture.start([
              {
                name,
                args: {
                  tabId: tab.id,
                  url: `${fixture.baseUrl}/slow-file`,
                  prompt: "fixture",
                },
              },
              {
                name: "manageTabs",
                args: { operation: "close", tabId: tab.id },
              },
            ]);
            await poll(() => slow.get(endpoint), 15000);
            await fixture.abort();
            await poll(() => slow.get(endpoint)?.closed, 5000);
            await delay(100);
            assert.equal(
              fixture.requests.length,
              1,
              "no model continuation after abort",
            );
            assert.equal(
              await page.call(
                async (id) => (await chrome.tabs.get(id)).id,
                tab.id,
              ),
              tab.id,
            );
            assert.equal(
              await page.call(
                async () => (await chrome.downloads.search({})).length,
              ),
              beforeDownloads,
            );
            if (name === "downloadAllImagesInTab")
              assert.equal(
                imageRequests,
                beforeImages,
                "no fetch of the second image",
              );
            slowDownloads = false;
            console.log(
              `${name}: loopback connection closed on abort; no later tab close/download.`,
            );
          },
        );

      for (const name of ["wait", "inspectPage", "cdpPage"])
        await t.test(`stop interrupts ${name} polling`, async () => {
          const step =
            name === "wait"
              ? { name, args: { milliseconds: 30000 } }
              : name === "inspectPage"
                ? {
                    name,
                    args: {
                      tabId: tab.id,
                      waitFor: {
                        selector: "#missing",
                        timeout: 30000,
                        pollMs: 25,
                      },
                    },
                  }
                : cdp("waitFor", {
                    text: ["missing fixture text"],
                    timeout: 30000,
                  });
          await fixture.start([
            ...(name === "cdpPage" ? [load(["cdpPage"])] : []),
            step,
            { name: "manageTabs", args: { operation: "close", tabId: tab.id } },
          ]);
          await poll(() =>
            page.call(
              (name) =>
                toolRun.events.some(
                  (event) =>
                    event.chunk?.toolName === name &&
                    event.chunk.state === "input-available",
                ),
              name,
            ),
          );
          await fixture.abort();
          await delay(100);
          if (name === "cdpPage")
            await poll(() =>
              page.call(
                async (id) =>
                  !(await chrome.debugger.getTargets()).find(
                    (target) => target.tabId === id,
                  )?.attached,
                tab.id,
              ),
            );
          assert.equal(
            await page.call(
              async (id) => (await chrome.tabs.get(id)).id,
              tab.id,
            ),
            tab.id,
          );
        });
      await t.test(
        "image edit abort closes its multipart provider request",
        async () => {
          slow.delete("/v1/images/edits");
          await fixture.start(
            [
              {
                name: "generateImage",
                args: {
                  prompt: "edit fixture",
                  referenceAttachmentIds: ["reference"],
                },
              },
            ],
            [
              {
                id: "reference",
                name: "reference.png",
                kind: "image",
                type: "image/png",
                size: png.length,
                dataUrl: `data:image/png;base64,${png.toString("base64")}`,
              },
            ],
          );
          await poll(() => slow.has("/v1/images/edits"));
          await fixture.abort();
          await poll(() => slow.get("/v1/images/edits")?.closed, 5000);
          assert.equal(fixture.requests.length, 1);
        },
      );

      await t.test(
        "element selector uses effective local theme over stale raw sync preferences",
        () => checkSelectorTheme(page, tab.id),
      );
    } finally {
      await fixture.close();
    }
  },
);
