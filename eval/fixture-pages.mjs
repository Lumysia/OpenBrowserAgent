// Deterministic fixture pages for the eval. Every page is generated from a
// fixed seed so runs compare like for like.

export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (next, items) => items[Math.floor(next() * items.length)];
const escape = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );

export function layout(title, body, script = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>body{font-family:sans-serif;max-width:960px;margin:0 auto;padding:16px;line-height:1.5}
nav a{margin-right:10px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px}
.ad{background:#fee;padding:8px;margin:8px 0}.hidden{display:none}</style></head>
<body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
}

const WORDS =
  "light keeper harbour signal coast storm glass lens beam night tower ship rock tide wind fog stone iron lamp oil watch season island channel".split(
    " ",
  );

function filler(next, sentences) {
  return Array.from({ length: sentences }, () => {
    const words = Array.from({ length: 9 + Math.floor(next() * 8) }, () =>
      pick(next, WORDS),
    );
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return `${words.join(" ")}.`;
  }).join(" ");
}

const ARTICLE = [
  "For more than two centuries, lighthouses have guided sailors past dangerous coasts, and their design reflects a long conversation between engineers and the sea.",
  "The earliest towers burned wood or coal in open braziers. The light was weak, smoky and hard to tell apart from fires on shore, so ships often mistook one harbour for another.",
  "A major change came in 1822, when the French physicist Augustin Fresnel presented a lens built from concentric rings of glass. It bent scattered light into a single strong beam that could be seen more than twenty miles away.",
  "Fresnel lenses were graded by order. A first-order lens stood taller than a person and was used on major coastal lights, while smaller sixth-order lenses marked harbour entrances and rivers.",
  "To help sailors identify each light, keepers used rotating lenses and shutters. Every station received its own pattern of flashes, known as its characteristic, which was printed in official lists of lights.",
  "Keeping the lamp burning was demanding work. Keepers trimmed wicks every few hours, polished the brass and glass, wound the clockwork that turned the lens, and recorded the weather in a daily log.",
  "Many stations were built on bare rock far from land. Supplies arrived by boat when the weather allowed, and families sometimes went weeks without fresh food or news from the mainland.",
  "Fog posed a different problem, because even the brightest beam disappears in thick mist. Stations added bells, sirens and later powerful diaphragm horns that could be heard several miles offshore.",
  "Electricity reached most lighthouses in the first half of the twentieth century. Electric lamps were brighter and needed far less care than oil, which reduced the number of keepers each station required.",
  "Automation followed. Light sensors switched the lamps on at dusk, backup bulbs rotated into place when one failed, and remote monitoring reported faults to a central office.",
  "By the end of the twentieth century, nearly every lighthouse in Europe and North America had been automated, and the profession of lighthouse keeper had almost disappeared.",
  "Satellite navigation now gives ships a precise position at any time, yet lighthouses remain in service. Sailors still rely on them when electronics fail, and they mark hazards that no screen can show as clearly.",
  "Today many old towers are museums or holiday cottages. Their lenses, logbooks and stories preserve a chapter of engineering history in which careful design and daily human effort kept ships off the rocks.",
];

export function articlePage() {
  return layout(
    "The Quiet Engineering of Lighthouses",
    `<nav><a href="#">Home</a><a href="#">Science</a><a href="#">History</a></nav>
<article><h1>The Quiet Engineering of Lighthouses</h1>
<h2>From fire to glass</h2>${ARTICLE.slice(0, 5)
      .map((text) => `<p>${text}</p>`)
      .join("")}
<h2>Life at the station</h2>${ARTICLE.slice(5, 9)
      .map((text) => `<p>${text}</p>`)
      .join("")}
<h2>The automatic age</h2>${ARTICLE.slice(9)
      .map((text) => `<p>${text}</p>`)
      .join("")}</article>`,
  );
}

export function newsPage() {
  const next = random(7);
  const nav = Array.from(
    { length: 28 },
    (_, index) => `<a href="#s${index}">Section ${index + 1}</a>`,
  ).join("");
  const sidebar = Array.from(
    { length: 14 },
    (_, index) =>
      `<li><a href="#n${index}">${filler(next, 1).slice(0, 70)}</a> <small>${index + 2} hours ago</small></li>`,
  ).join("");
  return layout(
    "Coastal Herald - Varnen tidal barrage approved",
    `<nav>${nav}</nav><div class="ad">Advertisement: Subscribe for 1 euro a month.</div>
<main><article><h1>Regional council approves Varnen tidal barrage</h1>
<p><em>By Hanne Solberg, Coastal Herald. Updated 09:40.</em></p>
<p>The regional council voted 31 to 12 on Tuesday to approve the Varnen tidal barrage, a 4.2 billion euro project that will span the mouth of the Varnen estuary and generate electricity from the tides.</p>
<p>Construction is scheduled to begin next spring and the barrage is expected to deliver power by 2031. Once complete, its turbines should supply about 410,000 homes, roughly a fifth of the region's households.</p>
<p>The project is expected to create 1,800 construction jobs and around 240 permanent positions in operations and maintenance.</p>
<p>Environmental groups criticised the decision. They warn that the barrage will change the tidal range inside the estuary and could harm mudflats used by migrating birds. The council said a 90 million euro habitat fund would create new wetlands further along the coast.</p>
<p>Fishing associations asked for guarantees that boats will keep access to the inner harbour. Engineers say the design includes a navigation lock open around the clock.</p>
<p>The national energy agency still has to confirm grid connection terms before the final investment decision, which is expected in the autumn.</p>
</article></main>
<aside><h2>More news</h2><ul>${sidebar}</ul></aside>
<div class="ad">Advertisement: Holiday cottages on the coast.</div>
<footer>${filler(next, 4)}</footer>`,
  );
}

export const FORM_COUNTRIES = [
  "Austria",
  "Belgium",
  "Canada",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Iceland",
  "Ireland",
  "Italy",
  "Japan",
  "Latvia",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
  "United States",
];

export function formPage() {
  const options = FORM_COUNTRIES.map(
    (country) => `<option>${country}</option>`,
  ).join("");
  return layout(
    "Workspace sign-up",
    `<h1>Create your workspace</h1>
<form id="signup">
<p><label>Full name <input name="name" required></label></p>
<p><label>Email <input name="email" type="email" required></label></p>
<p><label>Phone <input name="phone" type="tel"></label></p>
<p><label>Country <select name="country"><option value="">Choose…</option>${options}</select></label></p>
<fieldset><legend>Plan</legend>
<label><input type="radio" name="plan" value="basic"> Basic</label>
<label><input type="radio" name="plan" value="pro"> Pro</label>
<label><input type="radio" name="plan" value="team"> Team</label></fieldset>
<p><label><input type="checkbox" name="newsletter"> Send me the monthly newsletter</label></p>
<p><label>Start date <input type="date" name="start"></label></p>
<p><label>Message <textarea name="message" rows="3"></textarea></label></p>
<button type="submit">Create workspace</button></form><p id="status" role="status"></p>`,
    `document.getElementById("signup").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.newsletter = event.target.newsletter.checked;
  await fetch("/api/submit", { method: "POST", body: JSON.stringify(data) });
  document.getElementById("status").textContent = "Thank you, your workspace is being created.";
});`,
  );
}

const CATEGORIES = ["Tools", "Garden", "Kitchen", "Office", "Outdoor", "Toys"];
const WAREHOUSES = ["Bergen", "Malmo", "Tampere", "Aarhus", "Gdansk"];
const NOUNS = ["Clamp", "Lamp", "Kettle", "Rake", "Stapler", "Tent", "Kite"];

export function inventoryRows() {
  const next = random(11);
  return Array.from({ length: 600 }, (_, index) => ({
    sku: `SKU-${48213 - 437 + index}`,
    name: `${pick(next, ["Compact", "Heavy", "Classic", "Smart"])} ${pick(next, NOUNS)} ${index % 9}`,
    category: pick(next, CATEGORIES),
    price: (5 + next() * 300).toFixed(2),
    stock: Math.floor(next() * 900),
    warehouse: pick(next, WAREHOUSES),
  }));
}

export function inventoryPage() {
  const rows = inventoryRows()
    .map(
      (row) =>
        `<tr><td>${row.sku}</td><td>${row.name}</td><td>${row.category}</td><td>€${row.price}</td><td>${row.stock}</td><td>${row.warehouse}</td></tr>`,
    )
    .join("");
  return layout(
    "Inventory",
    `<h1>Inventory (600 items)</h1><table><thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Warehouse</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

export const LAPTOPS = {
  a: {
    name: "Altair 15",
    battery: "11 hours",
    weight: "1.62 kg",
    price: "$1,199",
  },
  b: {
    name: "Corvid 14",
    battery: "17 hours",
    weight: "1.18 kg",
    price: "$1,349",
    shipping: "$79 (express only)",
  },
  c: {
    name: "Lumen 13 Pro",
    battery: "14 hours",
    weight: "1.09 kg",
    price: "$1,599",
  },
};

export function laptopPage(id) {
  const laptop = LAPTOPS[id];
  const next = random(id.charCodeAt(0));
  return layout(
    `${laptop.name} - specifications`,
    `<nav><a href="#">Laptops</a><a href="#">Deals</a><a href="#">Support</a></nav>
<h1>${laptop.name}</h1><p class="price">${laptop.price}</p><p>${filler(next, 5)}</p>${laptop.shipping ? `<p class="shipping">Shipping: ${laptop.shipping}</p>` : `<p class="shipping">Free shipping</p>`}
<h2>Specifications</h2><table>
<tr><th>Display</th><td>${13 + (id.charCodeAt(0) % 3)}-inch IPS</td></tr>
<tr><th>Battery life</th><td>Up to ${laptop.battery} (video playback)</td></tr>
<tr><th>Weight</th><td>${laptop.weight}</td></tr>
<tr><th>Memory</th><td>16 GB</td></tr><tr><th>Storage</th><td>512 GB SSD</td></tr></table>
<h2>Reviews</h2><p>${filler(next, 8)}</p>`,
  );
}

export function faqPage() {
  const next = random(5);
  const topics = [
    ["Shipping", "Standard shipping takes 3 to 5 business days."],
    ["Payments", "We accept cards, bank transfer and invoices for companies."],
    ["Accounts", "You can change your email address in account settings."],
    ["Warranty", "All devices include a two year warranty."],
    [
      "Returns",
      "Unopened items can be returned within 30 days. Opened electronics can be returned within 21 days if all accessories are included. Software and gift cards cannot be returned.",
    ],
  ];
  const sections = topics.map(
    ([title, answer]) =>
      `<section><h2>${title}</h2><p>${filler(next, 6)}</p><p>${answer}</p><p>${filler(next, 6)}</p></section>`,
  );
  return layout(
    "Help Center",
    `<h1>Help Center</h1><p>Scroll down to load more topics.</p><div id="topics">${sections[0]}</div><div id="sentinel" style="height:40px">Loading more…</div>`,
    `const pending = ${JSON.stringify(sections.slice(1))};
// One topic per scroll that reaches the sentinel; content never loads without scrolling.
document.body.style.paddingBottom = "1500px";
addEventListener("scroll", () => {
  const sentinel = document.getElementById("sentinel");
  if (!sentinel || sentinel.getBoundingClientRect().top > innerHeight + 50) return;
  document.getElementById("topics").insertAdjacentHTML("beforeend", pending.shift());
  if (!pending.length) sentinel.remove();
});`,
  );
}
