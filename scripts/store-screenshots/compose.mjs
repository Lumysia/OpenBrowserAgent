import { FRAME, PAGE, PANEL, capture, delay, size } from "./browser.mjs";

const dataUrl = (png) => `data:image/png;base64,${png.toString("base64")}`;

// Lays the page and side panel captures side by side with a 1px divider and
// captures the result, so the output is one opaque 1280x800 frame.
export async function composeSplit(chromium, left, right) {
  const page = await chromium.open("about:blank");
  try {
    await size(page, FRAME);
    const { frameTree } = await page.send("Page.getFrameTree");
    await page.send("Page.setDocumentContent", {
      frameId: frameTree.frame.id,
      html: `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${FRAME.width}px; height: ${FRAME.height}px; overflow: hidden; background: #fff; }
  body { display: flex; }
  img { display: block; }
  .divider { width: ${FRAME.width - PAGE.width - PANEL.width}px; background: #e4e4e7; }
</style>
<img src="${dataUrl(left)}" width="${PAGE.width}" height="${PAGE.height}"><div class="divider"></div><img src="${dataUrl(right)}" width="${PANEL.width}" height="${PANEL.height}">`,
    });
    await page.call(() =>
      Promise.all([...document.images].map((image) => image.decode())).then(
        () => true,
      ),
    );
    await delay(100);
    return await capture(page);
  } finally {
    await page.send("Page.close").catch(() => {});
  }
}
