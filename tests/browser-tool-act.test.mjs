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
  "/covered": `<title>Covered</title>
<style>button{width:200px;height:40px;display:block;margin:8px}</style>
<button id="under" style="position:absolute;left:0;top:0">Under</button>
<div id="notice" style="position:fixed;left:0;top:0;width:300px;height:60px;background:#eee"><p style="margin:0">Cookie notice</p><button id="accept" style="width:80px;height:20px;margin:0;position:absolute;right:0;top:0" onclick="this.parentNode.remove()">Accept</button></div>
<button id="partly" style="position:absolute;left:0;top:100px">Partly</button>
<div style="position:absolute;left:0;top:100px;width:120px;height:40px;background:#ccc"></div>
<span style="position:absolute;left:0;top:160px;width:120px;height:30px"><input type="checkbox" id="agree" style="margin:0;width:120px;height:30px"><label for="agree" style="position:absolute;inset:0">Agree</label></span>
<button id="icon" aria-label="Star" style="position:absolute;left:0;top:200px"><span style="display:block;width:100%;height:100%">*</span></button>
<button id="ghost" style="position:absolute;left:0;top:260px">Ghost</button>
<div style="position:absolute;left:0;top:260px;width:300px;height:60px;pointer-events:none;opacity:0"></div>
<script>
window.clicks = [];
document.addEventListener("click", (event) => {
  const button = event.target.closest("button,input");
  if (button && button.id !== "accept") window.clicks.push(button.id + (button.id === "partly" && event.clientX > 120 ? ":uncovered" : ""));
});
</script>`,
  "/calendar": `<title>Calendar</title>
<div id="calendar" role="group" aria-label="Calendar"></div>
<div id="picks"></div><button id="refresh">Refresh</button>
<script>
let month = 1;
const calendar = document.getElementById("calendar");
const render = () => { calendar.innerHTML = "<h2>Month " + month + "</h2><button>Prev</button> <button>Next</button>"; };
calendar.onclick = (event) => { if (event.target.localName !== "button") return; month += event.target.textContent === "Next" ? 1 : -1; render(); };
const picks = () => { document.getElementById("picks").innerHTML = "<button>Pick</button> <button>Pick</button>"; };
document.getElementById("refresh").onclick = picks;
render(); picks();
</script>`,
  "/nav": `<title>Nav</title><a href="/quick">Quick</a>
<button onclick="history.pushState({}, '', '/nav/route')">Route</button>
<button onclick="setTimeout(() => { location.href = '/slow'; }, 150)">Slow</button>`,
  "/quick": `<title>Quick</title><h1>Quick page</h1>`,
  "/dense": `<title>Dense</title><button>Go</button><div style="font-size:2px;line-height:2px">${Array.from(
    { length: 300 },
    (_, index) => `<p style="margin:0">Line ${index} of the dense page</p>`,
  ).join("")}</div>`,
};

test(
  "act reports what changed",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      // A page that takes a while to answer: the navigation is pending.
      if (request.url === "/slow") {
        setTimeout(
          () =>
            response
              .writeHead(200, { "Content-Type": "text/html" })
              .end("<title>Slow</title>"),
          3000,
        );
        return true;
      }
      if (!PAGES[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(PAGES[request.url]);
      return true;
    });
    const { open, evaluate } = fixture;
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
            /No visible change in the viewport, and no navigation\.[^]*\nTicking: timer: Time left \d+$/,
          );
        },
      );

      await t.test(
        "covered elements fail unless forced; labels and icons do not cover",
        async () => {
          const tabId = await open("/covered");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const step = (label, extra = {}) => ({
            action: "click",
            ref: ref(snapshot, label),
            ...extra,
          });
          const act = (...steps) => ({ name: "act", args: { tabId, steps } });
          const [covered, others, forced] = await fixture.run([
            act(step('button "Under"')),
            act(
              step('button "Partly"'),
              step("checkbox"),
              step('button "Star"'),
              step('button "Ghost"'),
            ),
            act(step('button "Under"', { force: true })),
          ]);
          assert.match(
            covered,
            /Step 1 \(click e\d+\) failed: button "Under" \[e\d+\] is covered by div "Cookie notice Accept" \[e\d+\]\. Close or scroll the cover away/,
          );
          assert.doesNotMatch(others, /failed/);
          assert.match(
            forced,
            /covered by div "Cookie notice Accept"; acted on it anyway/,
          );
          assert.deepEqual(await evaluate(tabId, "window.clicks"), [
            "partly:uncovered",
            "agree",
            "icon",
            "ghost",
            "under",
          ]);
        },
      );

      await t.test(
        "a re-rendered ref finds the one element that replaced it",
        async () => {
          const tabId = await open("/calendar");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const next = ref(snapshot, 'button "Next"');
          const pick = ref(snapshot, 'button "Pick"');
          const click = (target) => ({ action: "click", ref: target });
          const [twice, ambiguous] = await fixture.run([
            { name: "act", args: { tabId, steps: [click(next), click(next)] } },
            {
              name: "act",
              args: {
                tabId,
                steps: [click(ref(snapshot, 'button "Refresh"')), click(pick)],
              },
            },
          ]);
          assert.match(
            twice,
            new RegExp(
              `Done: 1\\. click ${next}; 2\\. click ${next} \\(ref ${next} was re-rendered; used the matching button "Next" \\[e\\d+\\]\\)`,
            ),
          );
          assert.match(twice, /heading: Month 3/);
          assert.match(
            ambiguous,
            new RegExp(
              `Step 2 \\(click ${pick}\\) failed: Ref ${pick} is stale: the page re-rendered it, and 2 elements match it now: button "Pick" \\[e\\d+\\], button "Pick" \\[e\\d+\\]\\. Use the right one's ref\\.`,
            ),
          );
        },
      );

      await t.test(
        "snapshot: true appends a short viewport snapshot",
        async () => {
          const tabId = await open("/quiz");
          const dense = await open("/dense");
          const [quiz, denseSnapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
            { name: "snapshot", args: { tabId: dense, scope: "viewport" } },
          ]);
          const go = (id, target, snapshot) => ({
            name: "act",
            args: {
              tabId: id,
              ...(snapshot ? { snapshot: true } : {}),
              steps: [{ action: "click", ref: target }],
            },
          });
          const [started, plain, capped] = await fixture.run([
            go(tabId, ref(quiz, 'button "Start"'), true),
            go(tabId, ref(quiz, 'button "Nothing"'), false),
            go(dense, ref(denseSnapshot, 'button "Go"'), true),
          ]);
          assert.match(
            started,
            /\nSnapshot:\n\[Viewport y=0-\d+ of \d+px[^\n]*\]\n[^]*heading \[e\d+\] h2: Question 1 of 3/,
          );
          assert.doesNotMatch(plain, /Snapshot:/);
          assert.match(capped, /\[Snapshot cut at \d+ characters/);
          assert.ok(capped.length < 9_000, `${capped.length} chars`);
        },
      );

      await t.test(
        "navigation, pending loads and route changes are told apart",
        async () => {
          const tabId = await open("/nav");
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
          const [route] = await fixture.run([click('button "Route"')]);
          assert.match(
            route,
            /Same page, new URL: Nav \| http:\/\/\S+\/nav\/route\. Refs still work\.\nNothing in the viewport changed yet/,
          );
          const [pending] = await fixture.run([click('button "Slow"')]);
          assert.match(
            pending,
            /Navigating to http:\/\/\S+\/slow, still loading\. Take a snapshot when it has loaded/,
          );
          const back = await open("/nav");
          const [again] = await fixture.run([
            { name: "snapshot", args: { tabId: back } },
          ]);
          const [quick] = await fixture.run([
            {
              name: "act",
              args: {
                tabId: back,
                steps: [{ action: "click", ref: ref(again, "[Quick]") }],
              },
            },
          ]);
          assert.match(
            quick,
            /New page: Quick \| http:\/\/\S+\/quick\. Refs from before are gone: take a snapshot\./,
          );
          for (const text of [route, pending, quick])
            assert.doesNotMatch(text, /No visible change/);
        },
      );
    } finally {
      await fixture.close();
    }
  },
);
