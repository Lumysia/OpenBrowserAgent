import { layout, random } from "./fixture-pages.mjs";

const pick = (next, items) => items[Math.floor(next() * items.length)];

export function checkoutPage() {
  return layout(
    "Checkout",
    `<h1>Checkout</h1><div id="app"></div>`,
    `const state = { step: 1, plan: "", street: "", postal: "", city: "", country: "" };
const app = document.getElementById("app");
function render() {
  if (state.step === 1) app.innerHTML = '<h2>Step 1 of 3: Choose a plan</h2>' +
    ["Starter", "Pro", "Enterprise"].map((plan) => '<div class="plan"><h3>' + plan + '</h3><button data-plan="' + plan + '">Select ' + plan + '</button></div>').join("");
  if (state.step === 2) app.innerHTML = '<h2>Step 2 of 3: Shipping address</h2><p>Plan: ' + state.plan + '</p>' +
    '<p><label>Street <input id="street"></label></p><p><label>Postal code <input id="postal"></label></p>' +
    '<p><label>City <input id="city"></label></p><p><label>Country <input id="country"></label></p>' +
    '<button id="back">Back</button> <button id="next">Continue to review</button><p id="error" role="alert"></p>';
  if (state.step === 3) app.innerHTML = '<h2>Step 3 of 3: Review</h2><p>Plan: ' + state.plan + '</p><p>Ship to: ' +
    [state.street, state.postal + " " + state.city, state.country].join(", ") + '</p><button id="back">Back</button> <button id="place">Place order</button>';
  if (state.step === 4) app.innerHTML = '<h2>Order placed</h2><p>Your confirmation code is <strong id="code">' + state.code + '</strong>.</p>';
}
app.addEventListener("click", async (event) => {
  const target = event.target;
  if (target.dataset.plan) { state.plan = target.dataset.plan; state.step = 2; }
  else if (target.id === "back") state.step--;
  else if (target.id === "next") {
    for (const key of ["street", "postal", "city", "country"]) state[key] = document.getElementById(key).value.trim();
    if (!state.street || !state.postal || !state.city || !state.country) {
      document.getElementById("error").textContent = "Please fill in every address field.";
      return;
    }
    state.step = 3;
  } else if (target.id === "place") {
    const response = await fetch("/api/order", { method: "POST", body: JSON.stringify(state) });
    state.code = (await response.json()).code;
    state.step = 4;
  } else return;
  render();
});
render();`,
  );
}

const ZONES = [
  "Africa",
  "America",
  "Antarctica",
  "Asia",
  "Atlantic",
  "Australia",
  "Europe",
  "Indian",
  "Pacific",
];
const CITY_PARTS = ["Port", "San", "North", "Lake", "Fort", "Saint", "New"];
const CITY_ENDS = ["vale", "ford", "mouth", "haven", "field", "ton", "burg"];

export function timeZones() {
  const next = random(3);
  const zones = new Set(["Pacific/Chatham", "Pacific/Auckland"]);
  while (zones.size < 420)
    zones.add(
      `${pick(next, ZONES)}/${pick(next, CITY_PARTS)}_${pick(next, ["A", "Be", "Co", "Da", "El", "Fa", "Ga"])}${pick(next, CITY_ENDS)}`,
    );
  return [...zones].sort();
}

export function warehouses() {
  const next = random(9);
  const names = new Set(["Tromsø North", "Tromsø South"]);
  while (names.size < 300)
    names.add(
      `${pick(next, ["Oslo", "Bergen", "Narvik", "Bodø", "Alta", "Molde", "Hamar"])} ${pick(next, ["North", "South", "East", "West", "Central", "Port", "Hub"])} ${names.size}`,
    );
  return [...names].sort();
}

export function settingsPage() {
  const options = timeZones()
    .map((zone) => `<option value="${zone}">${zone}</option>`)
    .join("");
  const items = warehouses()
    .map(
      (name) =>
        `<li role="option" tabindex="-1" data-value="${name}">${name}</li>`,
    )
    .join("");
  return layout(
    "Account settings",
    `<h1>Account settings</h1>
<p><label>Time zone <select id="zone"><option value="">Select a time zone</option>${options}</select></label></p>
<p>Default warehouse</p>
<div class="combo"><button id="warehouse" aria-haspopup="listbox" aria-expanded="false">Choose a warehouse</button>
<ul id="list" role="listbox" class="hidden" style="max-height:200px;overflow:auto;border:1px solid #ccc">${items}</ul></div>
<p><button id="save">Save settings</button></p><p id="saved" role="status"></p>`,
    `const button = document.getElementById("warehouse");
const list = document.getElementById("list");
let warehouse = "";
button.addEventListener("click", () => {
  const open = list.classList.toggle("hidden") === false;
  button.setAttribute("aria-expanded", String(open));
});
list.addEventListener("click", (event) => {
  const value = event.target.dataset.value;
  if (!value) return;
  warehouse = value;
  button.textContent = value;
  list.classList.add("hidden");
  button.setAttribute("aria-expanded", "false");
});
document.getElementById("save").addEventListener("click", async () => {
  await fetch("/api/settings", { method: "POST", body: JSON.stringify({ zone: document.getElementById("zone").value, warehouse }) });
  document.getElementById("saved").textContent = "Settings saved.";
});`,
  );
}

const PEOPLE = ["mira", "jonas", "akira", "lena", "omar", "sofia", "tariq"];
const LABELS = ["bug", "docs", "feature", "ui", "performance", "question"];
const VERBS = ["Fix", "Improve", "Handle", "Update", "Refactor", "Document"];
const THINGS = ["sync", "export", "login", "search", "upload", "settings"];

export function issueRows() {
  const next = random(21);
  return Array.from({ length: 300 }, (_, index) => {
    const number = 4100 + index;
    const target = number === 4317;
    const decoy = number === 4205 || number === 4366;
    return {
      number,
      title: target
        ? "Scroll position resets after closing the preview dialog"
        : `${pick(next, VERBS)} ${pick(next, THINGS)} ${pick(next, ["flow", "error", "layout", "timeout"])}`,
      labels: target
        ? ["bug", "regression"]
        : decoy
          ? ["regression"]
          : [pick(next, LABELS)],
      assignee: target ? "mira" : decoy ? "jonas" : pick(next, PEOPLE),
      state: number === 4366 ? "closed" : next() < 0.15 ? "closed" : "open",
    };
  }).map((row) =>
    row.assignee === "mira" &&
    row.labels.includes("regression") &&
    row.number !== 4317
      ? { ...row, assignee: "omar" }
      : row,
  );
}

export function issuesPage() {
  const rows = issueRows()
    .map(
      (row) =>
        `<li class="issue"><span class="state">${row.state}</span> <a href="#${row.number}">#${row.number} ${row.title}</a> ${row.labels.map((label) => `<span class="label">${label}</span>`).join(" ")} <span class="assignee">@${row.assignee}</span></li>`,
    )
    .join("");
  return layout("Issues", `<h1>Issues</h1><ul>${rows}</ul>`);
}

export function orderRows() {
  const next = random(33);
  return Array.from({ length: 80 }, (_, index) => ({
    id: `ORD-${7001 + index}`,
    customer: pick(next, [
      "Nordvik AS",
      "Kestrel Ltd",
      "Brightwater",
      "Oak & Co",
    ]),
    status:
      index % 11 === 4
        ? "Refunded"
        : pick(next, ["Paid", "Paid", "Shipped", "Pending"]),
    amount: Math.round(20 + next() * 480),
  }));
}

export function ordersPage() {
  const rows = orderRows()
    .map(
      (row) =>
        `<tr><td>${row.id}</td><td>${row.customer}</td><td>${row.status}</td><td>$${row.amount}</td></tr>`,
    )
    .join("");
  return layout(
    "Orders",
    `<h1>Orders</h1><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

const TOPICS = [
  "solar inverters",
  "battery recycling",
  "e-ink tablets",
  "mesh routers",
  "OLED burn-in",
  "USB-C chargers",
  "heat pumps",
  "smart meters",
];

export function blogPosts() {
  const next = random(41);
  return Array.from({ length: 150 }, (_, index) => {
    const target = index === 96;
    return {
      id: index + 1,
      title: target
        ? "Quantum dots in display panels"
        : `${pick(next, ["A guide to", "Why we tested", "Notes on", "The trouble with"])} ${pick(next, TOPICS)}`,
      author: target
        ? "Ines Okafor"
        : pick(next, ["Per Holm", "Dana Wu", "Rui Costa", "Maya Berg"]),
      date: target ? "14 March 2026" : `${1 + (index % 28)} May 2025`,
    };
  });
}

export function blogIndexPage() {
  const links = blogPosts()
    .map((post) => `<li><a href="/blog/post-${post.id}">${post.title}</a></li>`)
    .join("");
  return layout("Tech blog", `<h1>All articles</h1><ul>${links}</ul>`);
}

export function blogPostPage(id) {
  const post = blogPosts()[id - 1];
  if (!post) return undefined;
  const next = random(id);
  return layout(
    post.title,
    `<a href="/blog">All articles</a><article><h1>${post.title}</h1><p class="byline">By ${post.author} · Published ${post.date}</p>
<p>${Array.from({ length: 40 }, () => pick(next, ["Panels", "colour", "light", "pixels", "efficiency", "brightness"])).join(" ")}.</p></article>`,
  );
}

export function todoItems() {
  const next = random(55);
  const months = ["2026-02", "2026-03", "2026-04"];
  let march = 0;
  return Array.from({ length: 60 }, (_, index) => {
    let month = pick(next, months);
    if (month === "2026-03" && march >= 7) month = "2026-04";
    if (month !== "2026-03" && march < 7 && index % 8 === 3) month = "2026-03";
    if (month === "2026-03") march++;
    const day = String(1 + Math.floor(next() * 28)).padStart(2, "0");
    return {
      id: index + 1,
      title: `${pick(next, ["Call", "Email", "Review", "Book", "Renew"])} ${pick(next, ["supplier", "contract", "insurance", "venue", "licence"])} ${index + 1}`,
      due: `${month}-${day}`,
    };
  });
}

export function todosPage() {
  const items = todoItems()
    .map(
      (item) =>
        `<li><label><input type="checkbox" data-id="${item.id}"> ${item.title}</label> <span class="due">due ${item.due}</span></li>`,
    )
    .join("");
  return layout("Tasks", `<h1>Tasks</h1><ul id="todos">${items}</ul>`);
}
