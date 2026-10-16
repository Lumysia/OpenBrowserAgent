import { layout } from "./fixture-pages.mjs";

// Pages for timed and obstructed interactions, as agent-evaluation sites
// build them.

export const QUIZ_QUESTIONS = [
  { text: "What is 17 + 25?", options: ["40", "42", "44", "52"], answer: "42" },
  {
    text: "Which planet is closest to the sun?",
    options: ["Venus", "Earth", "Mercury", "Mars"],
    answer: "Mercury",
  },
  { text: "What is 9 × 8?", options: ["63", "72", "81", "64"], answer: "72" },
];
// Seconds the quiz allows once started.
export const QUIZ_SECONDS = 120;

// The question shows only after Start, as text; the answers are buttons
// replaced for every question, and a countdown ticks while it runs.
export function quizPage() {
  return layout(
    "Speed quiz",
    `<h1>Speed quiz</h1><p>Answer three questions before the time runs out.</p>
<div id="quiz"><button id="start">Start quiz</button></div>
<p role="timer" id="timer"></p><p id="score">Score: 0</p>`,
    `const questions = ${JSON.stringify(QUIZ_QUESTIONS)};
const seconds = ${QUIZ_SECONDS};
const quiz = document.getElementById("quiz");
const timer = document.getElementById("timer");
const score = document.getElementById("score");
let index = 0, right = 0, startedAt = 0, ticking = 0;
const answers = [];
function tick() {
  const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
  timer.textContent = "Time left: " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  if (!left) finish();
}
function show() {
  const question = questions[index];
  quiz.innerHTML = '<h2>Question ' + (index + 1) + ' of ' + questions.length + '</h2><p>' + question.text + '</p>' +
    question.options.map((option) => '<button data-option="' + option + '">' + option + '</button>').join(" ");
}
async function finish() {
  clearInterval(ticking);
  const response = await fetch("/api/quiz", { method: "POST", body: JSON.stringify({ answers, ms: Date.now() - startedAt }) });
  const { code } = await response.json();
  quiz.innerHTML = '<h2>Quiz over</h2><p>You got ' + right + ' of ' + questions.length + '. Your code is <strong>' + code + '</strong>.</p>';
}
quiz.addEventListener("click", (event) => {
  const target = event.target;
  if (target.id === "start") {
    startedAt = Date.now();
    ticking = setInterval(tick, 1000);
    tick();
    show();
    return;
  }
  const option = target.dataset && target.dataset.option;
  if (!option) return;
  answers.push(option);
  if (option === questions[index].answer) right++;
  score.textContent = "Score: " + right;
  index++;
  if (index < questions.length) show(); else finish();
});`,
  );
}

// A consent banner covers the page until it is accepted; the report button
// under it only works after consent, like a click that would land on the
// banner.
export function coveredPage() {
  return layout(
    "Quarterly report",
    `<h1>Quarterly report</h1><p>The Q3 report is ready to download.</p>
<p><button id="download">Download report</button></p><p id="status" role="status"></p>
<div id="consent" style="position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center">
<div style="background:#fff;padding:16px;margin:16px;max-width:520px"><p>We use cookies to run this site.</p><button id="accept">Accept cookies</button></div></div>`,
    `let consented = false;
document.getElementById("accept").addEventListener("click", () => {
  consented = true;
  document.getElementById("consent").remove();
});
document.getElementById("download").addEventListener("click", async () => {
  if (!consented) return;
  const response = await fetch("/api/report", { method: "POST", body: "{}" });
  const { code } = await response.json();
  document.getElementById("status").textContent = "Download started. Receipt " + code + ".";
});`,
  );
}
