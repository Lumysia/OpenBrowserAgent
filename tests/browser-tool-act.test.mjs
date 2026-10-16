import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// What act reports after its steps, on pages that change text rather than
// controls.
const PAGES = {
  "/quiz": `<title>Quiz</title><h1>Quiz</h1>
<div id="quiz"><button id="start">Start</button></div>
<p id="score">Score: 0</p><button id="point">Add point</button> <button id="idle">Nothing</button>
<script>
let points = 0;
document.getElementById("start").onclick = () => {
  document.getElementById("quiz").innerHTML = '<h2>Question 1 of 3</h2><p>What is 2 + 2?</p><p role="timer" id="timer"></p>';
  const started = Date.now();
  setInterval(() => { document.getElementById("timer").textContent = "Time left " + (600 - Math.floor((Date.now() - started) / 50)); }, 50);
};
document.getElementById("point").onclick = () => { document.getElementById("score").textContent = "Score: " + ++points; };
</script>`,
};

test(
  "act reports what changed",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      if (!PAGES[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(PAGES[request.url]);
      return true;
    });
    const { open } = fixture;
    try {
      await t.test(
        "new and changed text; ticking text is not a change",
        async () => {
          const tabId = await open("/quiz");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const click = (label) => ({
            name: "act",
            args: {
              tabId,
              steps: [{ action: "click", ref: ref(snapshot, label) }],
            },
          });
          const [started] = await fixture.run([click('button "Start"')]);
          // The timer ticks between batches, as while a model thinks.
          await new Promise((resolve) => setTimeout(resolve, 300));
          const [scored, idle] = await fixture.run([
            click('button "Add point"'),
            click('button "Nothing"'),
          ]);
          assert.match(
            started,
            /New text:\n- heading: Question 1 of 3\n- text: What is 2 \+ 2\?\n- timer: Time left \d+/,
          );
          assert.doesNotMatch(started, /No visible change/);
          assert.match(
            scored,
            /Text changed:\n- text: Score: 1 \(was: Score: 0\)/,
          );
          assert.doesNotMatch(scored, /^- timer/m);
          assert.match(scored, /Ticking: timer: Time left \d+/);
          assert.match(
            idle,
            /No visible change in the viewport\.[^]*\nTicking: timer: Time left \d+$/,
          );
        },
      );
    } finally {
      await fixture.close();
    }
  },
);
