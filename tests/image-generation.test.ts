import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { generateImage } from "../src/background/image-generation";
import { imageModelFixture } from "./image-fixture";

afterEach(() => mock.restoreAll());

function setup(response: unknown) {
  imageModelFixture();
  return mock.method(globalThis, "fetch", async () => Response.json(response));
}

test("image generation accepts a URL response without base64 data", async () => {
  setup({ data: [{ url: "https://example.test/image.png" }] });
  const result = await generateImage([], { prompt: "fixture" });
  assert.equal(result.success, true);
  assert.equal(
    "image" in result && result.image,
    "https://example.test/image.png",
  );
});

for (const size of ["1x1", "300x300", "320x640", "1024x1024"]) {
  test(`image generation normalizes ${size} to a bounded valid request`, async () => {
    const fetch = setup({ data: [{ b64_json: "AA==" }] });
    const result = await generateImage([], { prompt: "fixture", size });
    assert.equal(result.success, true);
    const request = fetch.mock.calls[0].arguments as unknown as [
      string,
      RequestInit,
    ];
    const [width, height] = JSON.parse(String(request[1].body))
      .size.split("x")
      .map(Number);
    assert.ok(width * height >= 655_360);
    assert.ok(width * height <= 8_294_400);
    assert.equal(width % 16, 0);
    assert.equal(height % 16, 0);
    assert.ok(width <= 3840 && height <= 3840);
    assert.ok(Math.max(width, height) / Math.min(width, height) <= 3);
  });
}
