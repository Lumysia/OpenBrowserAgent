import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPTIONS_HASH,
  OPTIONS_PAGE_ROUTE,
  OPTIONS_ROUTE,
  resolveOptionsRoute,
} from "../src/shared/config";
import { DEFAULT_PREFERENCES } from "../src/shared/default-preferences";
import { chooseChatModel, chooseImageModel } from "../src/shared/model-choice";
import { MODEL_ROLES } from "../src/shared/model-roles";

test("old settings routes lead to where their page is now", () => {
  assert.equal(resolveOptionsRoute("#/smart-bar"), OPTIONS_ROUTE.smartBar);
  assert.equal(
    resolveOptionsRoute("#/page-translation"),
    OPTIONS_ROUTE.pageTranslate,
  );
  assert.equal(
    resolveOptionsRoute("#/context-menu"),
    OPTIONS_ROUTE.contextMenu,
  );
  assert.equal(resolveOptionsRoute("#/skills"), OPTIONS_ROUTE.skills);
  assert.equal(resolveOptionsRoute("#/mcp"), OPTIONS_ROUTE.mcp);
  assert.equal(
    resolveOptionsRoute("#/local-execution-bridges"),
    OPTIONS_ROUTE.localExecutionBridges,
  );
  assert.equal(resolveOptionsRoute("#/debug"), OPTIONS_ROUTE.debug);
  // Pages that kept their place, and an empty hash.
  assert.equal(resolveOptionsRoute("#/sync"), OPTIONS_ROUTE.sync);
  assert.equal(resolveOptionsRoute("#/providers"), OPTIONS_ROUTE.providers);
  assert.equal(resolveOptionsRoute(""), OPTIONS_ROUTE.general);
  assert.equal(resolveOptionsRoute(OPTIONS_HASH.mcp), OPTIONS_ROUTE.mcp);
});

test("six settings pages, and every sub-page inside one of them", () => {
  const pages = Object.entries(OPTIONS_PAGE_ROUTE).filter(
    ([id]) => id !== "welcome",
  );
  assert.equal(pages.length, 6);
  const routes = new Set<string>(Object.values(OPTIONS_PAGE_ROUTE));
  for (const route of Object.values(OPTIONS_ROUTE))
    assert.ok(routes.has(`/${route.split("/")[1]}`), route);
});

test("every feature's model is the chat's until one is picked", () => {
  for (const role of MODEL_ROLES)
    assert.equal(role.get(DEFAULT_PREFERENCES), undefined, role.id);
  assert.deepEqual(
    MODEL_ROLES.map((role) => role.id),
    ["chat", "helper", "smartBar", "translation", "images"],
  );
  // A choice is stored, and clearing it goes back to the chat's model
  // (for images: off).
  for (const role of MODEL_ROLES) {
    const picked = role.set(DEFAULT_PREFERENCES, "m2");
    assert.equal(role.get(picked), "m2", role.id);
    assert.equal(role.get(role.set(picked, undefined)), undefined, role.id);
  }
  const providers = {
    p: {
      type: "openai" as const,
      models: [
        { id: "m1", name: "m1" },
        { id: "m2", name: "m2" },
      ],
    },
  };
  const preferences = { ...DEFAULT_PREFERENCES, selectedModelId: "m2" };
  assert.equal(chooseChatModel(providers, preferences)?.model.id, "m2");
  // No image model chosen: image generation is off.
  assert.equal(chooseImageModel(providers, preferences), undefined);
  assert.equal(
    chooseImageModel(providers, { ...preferences, selectedImageModelId: "m1" })
      ?.model.id,
    "m1",
  );
});
