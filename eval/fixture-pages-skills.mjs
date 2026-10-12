import { layout, random } from "./fixture-pages.mjs";

// Fixture pages for the built-in skill tasks. The research topic is made up,
// so answers cannot come from the model's memory.

const SOURCES = {
  council: {
    title:
      "Vellmar City Council – Decision 2026/114: harbour ferry electrification",
    date: "12 March 2026",
    body: [
      "The City Council approved the final budget for the harbour ferry electrification programme at €48.6 million, replacing the 2024 estimate.",
      "The programme replaces the diesel fleet with four battery-electric ferries, one more than first planned, to allow a ten-minute frequency at peak hours.",
      "Shore charging will be built at both the Old Quay and Nordhavn terminals. Passenger service with the new ferries is scheduled to start in autumn 2028.",
      'The Municipal Audit Office has since reviewed the programme: <a href="/research/audit">audit review of 28 May 2026</a>.',
    ],
  },
  news2024: {
    title: "Vellmar Courier – Ferries to go electric by 2026",
    date: "3 June 2024",
    body: [
      "Vellmar plans to buy three electric ferries for about €31 million, the transport committee said on Monday.",
      "Officials hope the first electric crossings can begin in 2026, although the plan still needs final council approval.",
    ],
  },
  blog: {
    title: "Harbour Watcher blog – The ferry money pit",
    date: "20 April 2026",
    body: [
      "Everyone knows the ferry project will end up costing €60 million or more. I heard it from a friend at the yard.",
      "The council never tells the full story, so take every official number with a grain of salt.",
    ],
  },
  operator: {
    title: "Vellmar Ferries – Electric fleet FAQ",
    date: "updated 2 May 2026",
    body: [
      "Each new ferry carries up to 300 passengers and 40 bicycles.",
      "Charging takes about 12 minutes at each terminal while passengers board, and a crossing takes 18 minutes.",
      "The ferries are built by Kestrel Marine in Tromsø.",
    ],
  },
  audit: {
    title:
      "Vellmar Municipal Audit Office – Review of the ferry electrification programme",
    date: "28 May 2026",
    body: [
      "The audit found that the €48.6 million budget is realistic for the vessels, but that the grid connection at Nordhavn is behind schedule.",
      "If the grid upgrade slips further, the start of electric service could move from autumn 2028 to spring 2029, and total costs could rise to about €53 million.",
      "The office recommends a monthly progress report to the council.",
    ],
  },
};

export function researchHubPage() {
  // The audit is linked only from the council decision.
  const links = Object.entries(SOURCES)
    .filter(([id]) => id !== "audit")
    .map(
      ([id, source]) =>
        `<li><a href="/research/${id}">${source.title}</a> <small>(${source.date})</small></li>`,
    )
    .join("");
  return layout(
    "Vellmar Public Library – Topic guide: harbour ferry electrification",
    `<h1>Topic guide: harbour ferry electrification</h1>
<p>A list of sources the library has collected about the city's plan to replace its diesel harbour ferries. The library does not check the sources; read them critically.</p>
<ul>${links}</ul>`,
  );
}

export function researchSourcePage(id) {
  const source = SOURCES[id];
  if (!source) return undefined;
  return layout(
    source.title,
    `<article><h1>${source.title}</h1><p><time>${source.date}</time></p>${source.body
      .map((text) => `<p>${text}</p>`)
      .join("")}</article>`,
  );
}

export function factCheckPage() {
  return layout(
    "Five facts about Vellmar's new electric ferries",
    `<article><h1>Five facts about Vellmar's new electric ferries</h1>
<p>By the City Life team</p>
<ol>
<li>The council approved €60 million for the electric ferries.</li>
<li>Four battery-electric ferries will replace the diesel fleet.</li>
<li>Charging at each terminal takes about 12 minutes.</li>
<li>Electric service starts in 2026.</li>
<li>Each ferry carries up to 500 passengers.</li>
</ol>
<p>Sources: <a href="/research/council">council decision</a>, <a href="/research/operator">operator FAQ</a>, <a href="/research/news2024">Vellmar Courier</a>.</p></article>`,
  );
}

const ADJECTIVES = [
  "Amber",
  "Birch",
  "Cobalt",
  "Dune",
  "Ember",
  "Fjord",
  "Granite",
  "Harbor",
  "Indigo",
  "Juniper",
  "Kelp",
];
const PRODUCTS = ["Mug", "Lantern", "Notebook"];
const NOUNS = [...PRODUCTS, "Scarf"];
const PER_PAGE = 12;

// 44 products over four pages; page 3 repeats two featured products from
// page 2, so a complete list has 44 rows, not 48.
export function catalogItems() {
  const next = random(71);
  return ADJECTIVES.flatMap((adjective) =>
    NOUNS.map((noun) => ({
      name: `${adjective} ${noun}`,
      price: (5 + Math.round(next() * 9000) / 100).toFixed(2),
    })),
  );
}

export function catalogPage(url) {
  const items = catalogItems();
  const pages = Math.ceil(items.length / PER_PAGE);
  const page = Math.min(
    pages,
    Math.max(1, Number(url.searchParams.get("page")) || 1),
  );
  let shown = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  if (page === 3) shown = [...items.slice(13, 15), ...shown];
  const rows = shown
    .map(
      (item) =>
        `<li class="product"><h3>${item.name}</h3><p class="price">€${item.price}</p></li>`,
    )
    .join("");
  const nav = [
    page > 1 ? `<a href="/catalog?page=${page - 1}">Previous</a>` : "",
    `<span>Page ${page} of ${pages}</span>`,
    page < pages ? `<a href="/catalog?page=${page + 1}">Next</a>` : "",
  ].join(" ");
  return layout(
    `Nordic Goods – catalogue page ${page}`,
    `<h1>Catalogue</h1><p>${items.length} products.</p><ul>${rows}</ul><nav class="pager">${nav}</nav>`,
  );
}

// 52 products behind a "Load more" button (12 at a time); the page URL never
// changes, so the only way to all of them is clicking until it is gone.
export function loadMoreItems() {
  const next = random(97);
  return [
    "Alder",
    "Basalt",
    "Cedar",
    "Delta",
    "Elm",
    "Flint",
    "Gale",
    "Heath",
    "Iris",
    "Jade",
    "Knoll",
    "Larch",
    "Moss",
  ].flatMap((adjective) =>
    ["Kettle", "Blanket", "Candle", "Tray"].map((noun) => ({
      name: `${adjective} ${noun}`,
      price: (8 + Math.round(next() * 12000) / 100).toFixed(2),
    })),
  );
}

export function loadMorePage() {
  const items = loadMoreItems();
  return layout(
    "Hearth & Home – all products",
    `<h1>All products</h1><p>${items.length} products</p><ul id="list"></ul><button id="more">Load more</button>`,
    `const items = ${JSON.stringify(items)};
let shown = 0;
function more() {
  const list = document.getElementById("list");
  for (const item of items.slice(shown, shown + 12)) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>" + item.name + "</strong> – €" + item.price;
    list.append(li);
  }
  shown += 12;
  if (shown >= items.length) document.getElementById("more").remove();
}
document.getElementById("more").addEventListener("click", () => setTimeout(more, 400));
more();`,
  );
}
