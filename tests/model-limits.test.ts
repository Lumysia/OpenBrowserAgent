import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { Agent } from "@earendil-works/pi-agent-core";
import { providerModel } from "../src/background/model-resolver";
import { createProviderStream, piModel } from "../src/background/pi-provider";
import { chooseChatModel } from "../src/shared/model-choice";
import {
  forgetEditedModels,
  learnedRefusals,
  MODEL_REFUSAL,
  modelRef,
  normalizeLearnedModelLimits,
  withRefusal,
} from "../src/shared/model-limits";
import { storage } from "../src/shared/storage";
import type { ProviderState } from "../src/shared/types";
import { installChrome } from "./fake-chrome";
import { providerFixture, reply } from "./provider-fixtures";

beforeEach(() => {
  installChrome();
});

const providers = (
  baseUrl: string,
  displayName = "Fixture",
): ProviderState => ({
  openai: {
    id: "openai",
    type: "openai",
    baseUrl,
    models: [{ id: "openai:fixture", name: "fixture", displayName }],
  },
});

function choice(state: ProviderState) {
  const chosen = chooseChatModel(state, {});
  assert.ok(chosen);
  return chosen;
}

test("refusals are kept per model and forgotten when the model is edited", () => {
  const before = choice(providers("http://127.0.0.1:1/v1"));
  const ref = modelRef(before);
  const learned = withRefusal({}, ref, MODEL_REFUSAL.images);
  assert.deepEqual(learnedRefusals(learned, ref), [MODEL_REFUSAL.images]);
  assert.equal(withRefusal(learned, ref, MODEL_REFUSAL.images), learned);

  const unchanged = providers("http://127.0.0.1:1/v1");
  assert.equal(forgetEditedModels(learned, unchanged), learned);
  const renamed = providers("http://127.0.0.1:1/v1", "Renamed");
  assert.deepEqual(forgetEditedModels(learned, renamed), {});
  assert.deepEqual(
    learnedRefusals(learned, modelRef(choice(renamed))),
    [],
    "an edited model starts over even before the entry is dropped",
  );
});

test("stored learned limits keep only known refusals", () => {
  assert.deepEqual(
    normalizeLearnedModelLimits({
      a: { config: "c", refuses: ["images", "telepathy", "images"] },
      b: { config: "c", refuses: ["telepathy"] },
      c: { refuses: ["images"] },
    }),
    { a: { config: "c", refuses: ["images"] } },
  );
  assert.deepEqual(normalizeLearnedModelLimits(undefined), {});
});

test("a model that refused images gets text only in later runs until it is edited", async () => {
  const fixture = await providerFixture((request, response) => {
    if (JSON.stringify(request.body).includes("aGVsbG8=")) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"error":{"message":"unsupported image_url","type":"upstream_error"}}\n\n',
      );
    } else reply(response, request.protocol, { text: "Text only." });
  });
  const ask = async () => {
    const model = providerModel(choice(await storage.provider.get()));
    let notices = 0;
    const agent = new Agent({
      streamFn: createProviderStream(model, undefined, () => notices++),
      initialState: { model: piModel(model) },
    });
    const before = fixture.requests.length;
    await agent.prompt("Read this", [
      { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
    ]);
    assert.equal(agent.state.errorMessage, undefined);
    assert.equal(notices, 1, "the user is told the images were left out");
    return fixture.requests.length - before;
  };
  try {
    const baseUrl = `${fixture.baseUrl}/v1`;
    await storage.provider.replace(providers(baseUrl));
    assert.equal(await ask(), 2, "refused once, then sent without images");
    assert.equal(await ask(), 1, "sent without images from the start");

    await storage.provider.replace(providers(baseUrl, "Edited"));
    assert.deepEqual(await storage.learnedModelLimits.get(), {});
    assert.equal(await ask(), 2, "an edited model tries images again");
  } finally {
    await fixture.close();
  }
});
