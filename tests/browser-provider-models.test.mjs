import assert from "node:assert/strict";
import { test } from "node:test";
import { getMessages } from "../src/shared/i18n.ts";
import { LIST_PROVIDER_MODELS } from "../src/shared/provider-requests.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";

const t = getMessages("en-US");

// "Fetch models" in Settings asks the background, which lists the models
// from the provider's endpoint; a provider without permission to receive
// content gets no request (it would carry the API key).
const REMOTE = "ai.model-list.test";
const MODELS = ["fixture-alpha", "fixture-beta"];

test(
  "loading a provider's models in Settings",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      handle: (request, response) => {
        if (request.url === "/v1/models")
          return response
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ data: MODELS.map((id) => ({ id })) }));
        response.writeHead(404).end();
      },
      args: [`--host-resolver-rules=MAP ${REMOTE} 127.0.0.1`],
    });
    const { fixture, options, extensionUrl } = session;
    const listRequests = () =>
      fixture.requests.filter((request) => request.url === "/v1/models");
    const port = new URL(fixture.baseUrl).port;
    const shownText = () => options.call(() => document.body.textContent);
    // Opens the provider named `name` and presses its fetch button.
    const fetchIn = (name) =>
      poll(() =>
        options.call(
          ({ name, label }) => {
            const item = [
              ...document.querySelectorAll(".ui-accordion-item"),
            ].find((item) =>
              item
                .querySelector(":scope > .ui-accordion-header")
                ?.textContent.includes(name),
            );
            if (!item) return false;
            if (item.dataset.state !== "open")
              item.querySelector(".ui-accordion-trigger").click();
            const button = [...item.querySelectorAll("button")].find(
              (button) => button.textContent.trim() === label,
            );
            if (!button) return false;
            button.click();
            return true;
          },
          { name, label: t.options.fetchModels },
        ),
      );
    try {
      const worker = await session.worker();
      await worker.call((type) => {
        self.modelLists = 0;
        chrome.runtime.onMessage.addListener((message) => {
          if (message?.type === type) self.modelLists++;
        });
      }, LIST_PROVIDER_MODELS);
      await options.call((items) => chrome.storage.local.set(items), {
        language: "en-US",
        provider: {
          fixture: {
            id: "fixture",
            type: "openai",
            label: "Local fixture",
            baseUrl: `${fixture.baseUrl}/v1`,
            apiKey: "local-key",
            models: [],
          },
          remote: {
            id: "remote",
            type: "openai",
            label: "Remote fixture",
            baseUrl: `http://${REMOTE}:${port}/v1`,
            apiKey: "remote-key",
            models: [],
          },
        },
      });
      await options.send("Page.navigate", {
        url: extensionUrl("options.html#/providers"),
      });
      await poll(() =>
        options.call(() =>
          document.body.textContent.includes("Remote fixture"),
        ),
      );

      await fetchIn("Local fixture");
      await poll(async () => (await shownText()).includes(MODELS[0]));
      assert.equal(await worker.call(() => self.modelLists), 1);
      const [listed] = listRequests();
      assert.equal(listed.headers.authorization, "Bearer local-key");

      await fetchIn("Remote fixture");
      await poll(async () =>
        (await shownText()).includes(t.options.fetchModelsError),
      );
      assert.equal(await worker.call(() => self.modelLists), 2);
      assert.equal(listRequests().length, 1);
    } finally {
      await session.close();
    }
  },
);
