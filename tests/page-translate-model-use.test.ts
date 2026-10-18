import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PAGE_TRANSLATE_ENGINE,
  PAGE_TRANSLATE_ENGINES,
  PAGE_TRANSLATE_FALLBACK,
  pageTranslateUsesModel,
} from "../src/shared/page-translate/settings";

test("model use: only the AI engine uses the model", () => {
  assert.deepEqual(PAGE_TRANSLATE_ENGINES.filter(pageTranslateUsesModel), [
    PAGE_TRANSLATE_ENGINE.model,
  ]);
});

test("model use: no engine hands its pages to the AI model", () => {
  for (const engine of PAGE_TRANSLATE_ENGINES)
    assert.notEqual(
      PAGE_TRANSLATE_FALLBACK[engine],
      PAGE_TRANSLATE_ENGINE.model,
      engine,
    );
});
