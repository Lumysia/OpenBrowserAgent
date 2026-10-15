import {
  FRAME,
  capture,
  click,
  delay,
  extensionUrl,
  launch,
  poll,
  size,
  useLocale,
} from "./browser.mjs";
import { OPTIONS_ROUTE } from "../../src/shared/config.ts";
import { movePointer } from "../../tests/cdp-input.mjs";
import { seedOptions } from "./seed.mjs";

// Space kept between the frame edges and the content that must show whole.
const MARGIN = 16;

// Each settings shot opens a route and expands one card with a real click.
// Cards are found by what the seed stored, not by UI text: an agent id, the
// main AI provider's name. `fit` is the content that must end inside the
// frame: the last card on the page, or the last control of the expanded card
// when the page goes on below it.
export const OPTIONS_SHOTS = [
  {
    name: "agents",
    route: OPTIONS_ROUTE.agents,
    expand: () => "general-agent",
    fit: "page",
  },
  {
    name: "providers",
    route: OPTIONS_ROUTE.providers,
    expand: (demo) => demo.providers.main,
    fit: "card",
  },
];

// Scrolls as far as the page heading (or the tabs above it) allows for the `fit` content to end
// above the bottom edge, then reports what the frame still cuts.
function fitFrame(page, fit) {
  return page.call(
    ({ fit, margin, height }) => {
      const scroller = document.querySelector(".ui-scroll-area-viewport");
      const card = document
        .querySelector(".ui-accordion-trigger[data-state=open]")
        ?.closest(".ui-accordion-item");
      if (!scroller || !card) return ["expanded card not found"];
      const visible = (element) => element.getBoundingClientRect().height > 0;
      const target =
        fit === "card"
          ? [...card.querySelectorAll("button, input, textarea")]
              .filter(visible)
              .sort(
                (a, b) =>
                  a.getBoundingClientRect().bottom -
                  b.getBoundingClientRect().bottom,
              )
              .at(-1)
          : [...scroller.querySelectorAll(".ui-card, .ui-accordion-item")]
              .filter(visible)
              .at(-1);
      const heading = scroller.querySelector("[role=tablist], h1, h2");
      const bottom = target.getBoundingClientRect().bottom + margin;
      const limit = heading
        ? Math.max(0, heading.getBoundingClientRect().top - margin / 2)
        : Infinity;
      scroller.scrollTo(0, Math.min(Math.max(0, bottom - height), limit));
      // The next card may show its top edge below the content: an empty
      // sliver that only says the page goes on.
      const sliver = (element, rect) =>
        element.matches(".ui-card, .ui-accordion-item") &&
        rect.top > height - margin * 1.5;
      const cut = (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.height > 0 &&
          (element === target || !element.contains(target)) &&
          !sliver(element, rect) &&
          ((rect.top < 0 && rect.bottom > 0) ||
            (rect.top < height && rect.bottom > height))
        );
      };
      return [
        ...scroller.querySelectorAll(
          ".ui-card, .ui-accordion-item, [role=tablist], h1, h2, h3, p, label, button, input, textarea",
        ),
      ]
        .filter(cut)
        .map(
          (element) =>
            `cut by the frame: ${element.textContent.trim().slice(0, 60) || element.className}`,
        );
    },
    { fit, margin: MARGIN, height: FRAME.height },
  );
}

export async function optionsShots(demo) {
  const chromium = await launch(demo.locale);
  try {
    const page = await chromium.open(extensionUrl(chromium, "options.html"));
    await size(page, FRAME);
    await useLocale(page, demo.locale);
    await seedOptions(page, demo);
    await poll(() =>
      page.call(() => !!document.querySelector(".ui-scroll-area-viewport")),
    );
    await delay(1500);
    const shots = [];
    for (const item of OPTIONS_SHOTS) {
      await page.call((route) => (location.hash = `#${route}`), item.route);
      await delay(1200);
      await click(page, ".ui-accordion-trigger", item.expand(demo));
      await delay(1000);
      const warnings = await fitFrame(page, item.fit);
      await movePointer(page, { x: FRAME.width - 1, y: FRAME.height - 1 });
      await page.call(() => document.activeElement?.blur());
      await delay(800);
      shots.push({ name: item.name, png: await capture(page), warnings });
    }
    return shots;
  } finally {
    await chromium.close();
  }
}
