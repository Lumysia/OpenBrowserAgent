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

// A sign-in form whose API refuses the login and says why only in its
// response; the page itself shows a generic message.
export const LOGIN_REFUSAL = {
  password: "harbour-lamp-77",
  address: "192.168.1.50",
  status: 401,
  body: {
    error: "ip_banned",
    message:
      "Too many failed logins from 192.168.1.50: this address is banned until it is removed from the ban list.",
  },
};

export function loginPage() {
  return layout(
    "Sign in",
    `<h1>Home server</h1><form id="login"><p><label>Username <input name="username" value="owner"></label></p>
<p><label>Password <input name="password" type="password" value="${LOGIN_REFUSAL.password}"></label></p>
<p><button>Sign in</button></p><p id="error" role="alert"></p></form>`,
    `document.getElementById("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const response = await fetch("/auth/login_flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: form.get("username"), password: form.get("password"), client_id: location.origin + "/" }),
  });
  if (!response.ok) {
    document.getElementById("error").textContent = "Login failed. Please try again.";
    console.warn("login request failed", response.status);
  }
});`,
  );
}
