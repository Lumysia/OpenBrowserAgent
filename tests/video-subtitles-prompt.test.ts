import assert from "node:assert/strict";
import { test } from "node:test";
import {
  modelEngine,
  modelPrompt,
} from "../src/background/page-translate/engines/model";
import { engineCacheKey } from "../src/background/page-translate/engines/types";
import { PAGE_TRANSLATE_CONTENT } from "../src/shared/page-translate/protocol";
import type { ProviderModel } from "../src/background/pi-provider";

const items = [
  { id: 1, text: "So we went back." },
  { id: 2, text: "And then it rained." },
];

test("subtitles get their own prompt: video title and the lines before", () => {
  const subtitles = modelPrompt({
    items,
    target: "de",
    pageTitle: "A trip - Video",
    context: { before: "We left at nine." },
    content: PAGE_TRANSLATE_CONTENT.subtitles,
  });
  assert.match(subtitles.system, /subtitle/);
  assert.match(subtitles.system, /German/);
  assert.match(subtitles.prompt, /^Video title: A trip - Video$/m);
  assert.match(
    subtitles.prompt,
    /^Said just before the items: We left at nine\.$/m,
  );
  assert.match(subtitles.prompt, /\[\[1\]\]\nSo we went back\./);
  // The system prompt doesn't change between batches.
  const other = modelPrompt({
    items: items.slice(1),
    target: "de",
    content: PAGE_TRANSLATE_CONTENT.subtitles,
  });
  assert.equal(other.system, subtitles.system);

  const page = modelPrompt({ items, target: "de", pageTitle: "A trip" });
  assert.match(page.system, /web page/);
  assert.match(page.prompt, /^Page title: A trip$/m);
});

test("the AI model caches subtitle translations apart from page text", () => {
  const engine = modelEngine({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    modelName: "m",
  } as ProviderModel);
  const page = engineCacheKey(engine);
  const subtitles = engineCacheKey(engine, PAGE_TRANSLATE_CONTENT.subtitles);
  assert.notEqual(page, subtitles);
  assert.equal(engineCacheKey(engine, PAGE_TRANSLATE_CONTENT.page), page);
});
