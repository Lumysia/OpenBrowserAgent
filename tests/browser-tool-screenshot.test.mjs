import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Screenshots of one element or region, through the debugger.
const PAGES = {
  "/shapes": `<title>Shapes</title><style>body{margin:0;background:#fff}</style>
<div style="height:1500px"></div>
<button id="red" style="display:block;margin-left:100px;width:60px;height:40px;background:#f00;border:0">Red</button>
<div style="height:1500px"></div>`,
};

test(
  "element and region screenshots",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const fixture = await browserToolFixture((request, response) => {
      if (!PAGES[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(PAGES[request.url]);
      return true;
    });
    const { page } = fixture;
    // An image's size and the colour of a few of its points, as shares of
    // its size.
    const pixels = (image, points) =>
      page.call(
        async ({ image, points }) => {
          const bitmap = await createImageBitmap(
            await (await fetch(image)).blob(),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0);
          return {
            width: bitmap.width,
            height: bitmap.height,
            colours: points.map(([x, y]) => {
              const [r, g, b] = context.getImageData(
                Math.floor(bitmap.width * x),
                Math.floor(bitmap.height * y),
                1,
                1,
              ).data;
              return r > g + 80 && r > b + 80
                ? "red"
                : r > 200 && g > 200 && b > 200
                  ? "white"
                  : `${r},${g},${b}`;
            }),
          };
        },
        { image, points },
      );
    try {
      const tabId = await fixture.open("/shapes");
      const [snapshot] = await fixture.run([
        { name: "snapshot", args: { tabId, scope: "page" } },
      ]);
      const red = ref(snapshot, 'button "Red"');
      const [element, region] = await fixture.run([
        { name: "screenshot", args: { tabId, ref: red, zoom: 2 } },
        {
          name: "screenshot",
          args: { tabId, region: { x: 0, y: 0, width: 50, height: 30 } },
        },
      ]);
      // The button, scrolled to the middle, with an 8px margin, at 2x.
      const box = element.match(
        /viewport x=(\d+) y=(\d+), (\d+)x(\d+) CSS px, at 2x\. Image point \(a, b\) is viewport point \(\1 \+ a\/2, \2 \+ b\/2\)/,
      );
      assert.ok(box, element);
      assert.deepEqual(
        [Number(box[1]), Number(box[3]), Number(box[4])],
        [92, 76, 56],
      );
      const [shot, plain] = (await fixture.outputs())
        .filter((item) => item.name === "screenshot")
        .map((item) => item.output.image);
      const cropped = await pixels(shot, [
        [0.5, 0.5],
        [0.05, 0.05],
      ]);
      assert.deepEqual(
        { width: cropped.width, height: cropped.height },
        { width: 152, height: 112 },
      );
      assert.deepEqual(cropped.colours, ["red", "white"]);
      assert.match(
        region,
        /viewport x=0 y=0, 50x30 CSS px, at 1x\. Image point \(a, b\) is viewport point \(0 \+ a, 0 \+ b\)/,
      );
      const top = await pixels(plain, [[0.5, 0.5]]);
      assert.deepEqual(top, { width: 50, height: 30, colours: ["white"] });
    } finally {
      await fixture.close();
    }
  },
);
