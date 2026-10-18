import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_TRANSLATE_ENGINE,
  PAGE_TRANSLATE_ENGINES,
  PAGE_TRANSLATE_FALLBACK,
  pageTranslateModelUse,
} from "../src/shared/page-translate/settings";

test("model use: the AI engine uses the model, engines handing over to it use it as fallback", () => {
  for (const engine of PAGE_TRANSLATE_ENGINES) {
    const expected =
      engine === PAGE_TRANSLATE_ENGINE.model
        ? "engine"
        : PAGE_TRANSLATE_FALLBACK[engine] === PAGE_TRANSLATE_ENGINE.model
          ? "fallback"
          : undefined;
    assert.equal(pageTranslateModelUse(engine), expected, engine);
  }
});

test("model use: the free services never reach the model, the built-in translator does", () => {
  assert.equal(
    pageTranslateModelUse(PAGE_TRANSLATE_ENGINE.browser),
    "fallback",
  );
  assert.equal(pageTranslateModelUse(PAGE_TRANSLATE_ENGINE.google), undefined);
  assert.equal(
    pageTranslateModelUse(PAGE_TRANSLATE_ENGINE.microsoft),
    undefined,
  );
});
