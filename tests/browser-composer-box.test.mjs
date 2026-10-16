import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { composerFixture } from "./browser-composer.mjs";
import { poll } from "./chromium.mjs";

// Focuses (or blurs) the composer and reads the box's shadow before, once
// the box-shadow transition has run a frame, and at its end. `ran` is false
// when no box-shadow transition started: the lists cannot interpolate.
function focusTransition(page, focus) {
  return page.call(async (focus) => {
    const box = document.querySelector(".composer-box");
    const area = box.querySelector("textarea");
    const style = getComputedStyle(box);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const event = (type) =>
      new Promise((resolve) => {
        const listener = (event) => {
          if (event.target !== box || event.propertyName !== "box-shadow")
            return;
          box.removeEventListener(type, listener);
          resolve(true);
        };
        box.addEventListener(type, listener);
      });
    const before = style.boxShadow;
    const run = event("transitionrun");
    const end = event("transitionend");
    if (focus) area.focus();
    else area.blur();
    const ran = await Promise.race([
      run,
      // Only the failure path waits this long.
      new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
    ]);
    if (!ran) return { ran, before, after: style.boxShadow };
    await frame();
    await frame();
    const middle = style.boxShadow;
    await end;
    return { ran, before, middle, after: style.boxShadow };
  }, focus);
}

// The box-shadow entry of the box's transition (the last one wins).
function boxShadowDuration(page) {
  return page.call(() => {
    const style = getComputedStyle(document.querySelector(".composer-box"));
    const properties = style.transitionProperty.split(",").map((p) => p.trim());
    const durations = style.transitionDuration.split(",").map(parseFloat);
    const index = properties.lastIndexOf("box-shadow");
    return index < 0 ? 0 : durations[index % durations.length];
  });
}

test(
  "the composer's focus glow fades in and out",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await composerFixture();
    try {
      await session.configure();
      const { page } = session;
      await poll(() =>
        page.call(() => !!document.querySelector(".composer-box textarea")),
      );
      await page.call(() =>
        document.querySelector(".composer-box textarea").blur(),
      );
      assert.ok((await boxShadowDuration(page)) >= 0.2);
      for (const focus of [true, false]) {
        const shadow = await focusTransition(page, focus);
        assert.ok(
          shadow.ran,
          `box-shadow transitions on ${focus ? "focus" : "blur"}`,
        );
        assert.notEqual(shadow.before, shadow.after);
        assert.notEqual(shadow.middle, shadow.before);
        assert.notEqual(shadow.middle, shadow.after);
      }
      // Reduced motion: the glow changes at once, as everywhere else.
      await page.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      assert.ok((await boxShadowDuration(page)) <= 0.001);
    } finally {
      await session.close();
    }
  },
);

test(
  "the composer is frosted glass, solid with reduced transparency",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await composerFixture();
    try {
      await session.configure();
      const { page } = session;
      await poll(() =>
        page.call(() => !!document.querySelector(".composer-box textarea")),
      );
      const look = () =>
        page.call(() => {
          const style = getComputedStyle(
            document.querySelector(".composer-box"),
          );
          const probe = document.createElement("i");
          probe.style.color = "var(--field)";
          document.body.append(probe);
          const field = getComputedStyle(probe).color;
          probe.remove();
          return {
            backdrop: style.backdropFilter,
            solid: style.backgroundColor === field,
          };
        });
      const glass = await look();
      assert.match(glass.backdrop, /blur\(/);
      assert.equal(glass.solid, false);
      await page.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
      });
      // The background fades to the solid field like any colour change.
      const reduced = await poll(async () => {
        const value = await look();
        return value.solid && value;
      });
      assert.equal(reduced.backdrop, "none");
    } finally {
      await session.close();
    }
  },
);
