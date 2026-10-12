import { orderRows, todoItems } from "./fixture-pages-apps.mjs";

// Each task opens `tabs` (fixture paths or live URLs; the first is active),
// sends `prompt` through the side panel composer, then `check` decides success
// from the final answer, fixture server posts, or page DOM state. `prepare`
// (optional) records page state before the prompt is sent, for `check`.
// Informational tasks are run and reported but not counted as passed or
// failed: their answer can come from the model's memory.
const has = (answer, ...patterns) =>
  patterns.every((pattern) => pattern.test(answer));
const result = (ok, detail) => ({ ok: !!ok, detail });
const lastPost = (posts, path) =>
  posts.filter((post) => post.path === path).at(-1);

export const TASKS = [
  {
    id: "translate-article",
    tabs: ["/article"],
    prompt:
      "Translate this whole page into Simplified Chinese in place, replacing the English text on the page.",
    async check({ page }) {
      const stats = await (
        await page("/article")
      ).call(() => {
        const nodes = [
          ...document.querySelectorAll("article h1, article h2, article p"),
        ];
        const translated = nodes.filter((node) => {
          const text = node.textContent;
          const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
          const latin = (text.match(/[A-Za-z]/g) || []).length;
          return cjk > 0 && cjk >= latin;
        });
        return { total: nodes.length, translated: translated.length };
      });
      // Every heading and paragraph of the fixture article.
      return result(stats.total === 17 && stats.translated === 17, stats);
    },
  },
  {
    id: "summarize-news",
    tabs: ["/news"],
    prompt:
      "Summarize the main story on this page in three short bullet points. Include the key numbers.",
    async check({ answer }) {
      const facts = [/4[.,]2/, /2031/, /1[,.\s]?800/, /410[,.\s]?000/].filter(
        (pattern) => pattern.test(answer),
      ).length;
      return result(facts >= 3 && /varnen/i.test(answer), { facts });
    },
  },
  {
    id: "fill-form",
    tabs: ["/form"],
    prompt:
      "Fill out this sign-up form and submit it: name Mara Lindqvist, email mara.l@example.org, phone +46 70 123 45 67, country Sweden, Team plan, subscribe to the newsletter, start date 2 November 2026, message: Please invoice quarterly.",
    async check({ posts }) {
      const data = lastPost(posts, "/api/submit")?.data;
      const expected = {
        name: "Mara Lindqvist",
        email: "mara.l@example.org",
        country: "Sweden",
        plan: "team",
        start: "2026-11-02",
        newsletter: true,
      };
      const wrong = data
        ? Object.keys(expected).filter((key) => data[key] !== expected[key])
        : ["no submission"];
      if (data && !/invoice quarterly/i.test(data.message || ""))
        wrong.push("message");
      if (data && (data.phone || "").replace(/\D/g, "") !== "46701234567")
        wrong.push("phone");
      return result(!wrong.length, { wrong });
    },
  },
  {
    id: "inventory-lookup",
    tabs: ["/inventory"],
    prompt:
      "In this inventory table, what are the price and the stock count of SKU-48213, and which warehouse is it in?",
    check: ({ answer }) =>
      result(
        has(
          answer,
          /115[.,]63/,
          /stock[^.\n]{0,40}\b557\b|\b557\b[^.\n]{0,20}(units|in stock|stock)/i,
          /malm[oö]/i,
        ),
      ),
  },
  {
    id: "compare-tabs",
    tabs: ["/laptop/a", "/laptop/b", "/laptop/c"],
    prompt:
      "I have three laptop pages open in my tabs. Which laptop has the longest battery life? Tell me its weight and price.",
    // The winner's weight and price, not every laptop's.
    check: ({ answer }) =>
      result(
        has(answer, /corvid 14/i, /1[.,]18\s?kg/i, /1[,.]?349/) &&
          !/1[,.]?199|1[,.]?599|1[.,]62\s?kg|1[.,]09\s?kg/i.test(answer),
      ),
  },
  {
    id: "scroll-answer",
    tabs: ["/help"],
    prompt:
      "According to this help page, how many days do I have to return opened electronics?",
    check: ({ answer }) => result(has(answer, /\b21[\s-]?days?\b/i)),
  },
  {
    id: "checkout-flow",
    tabs: ["/checkout"],
    prompt:
      "Complete this checkout: choose the Pro plan, ship to 12 Harbor Street, 0150 Oslo, Norway, place the order, and tell me the confirmation code.",
    async check({ answer, posts }) {
      const post = lastPost(posts, "/api/order");
      const order = post?.data;
      const ok =
        order?.plan === "Pro" &&
        /12 harbou?r street/i.test(order.street) &&
        order.postal === "0150" &&
        /oslo/i.test(order.city) &&
        /norway/i.test(order.country);
      return result(ok && answer.includes(post.code), { order: !!order, ok });
    },
  },
  {
    id: "large-dropdown",
    tabs: ["/settings"],
    prompt:
      "On this settings page, set the time zone to Pacific/Chatham and the default warehouse to Tromsø North, then save the settings.",
    async check({ posts }) {
      const data = lastPost(posts, "/api/settings")?.data;
      return result(
        data?.zone === "Pacific/Chatham" && data?.warehouse === "Tromsø North",
        data || {},
      );
    },
  },
  {
    id: "find-issue",
    tabs: ["/issues"],
    prompt:
      "Find the open issue labeled 'regression' that is assigned to mira. What is its number and title?",
    check: ({ answer }) => result(has(answer, /4317/, /scroll position/i)),
  },
  {
    id: "orders-total",
    tabs: ["/orders"],
    prompt:
      "How many orders in this table have the status Refunded, and what is their total amount?",
    check({ answer }) {
      const refunded = orderRows().filter((row) => row.status === "Refunded");
      const total = refunded.reduce((sum, row) => sum + row.amount, 0);
      const totalPattern = new RegExp(
        String(total).replace(/(\d)(?=(\d{3})+$)/, "$1[,.\\s]?"),
      );
      return result(
        totalPattern.test(answer) &&
          new RegExp(`\\b${refunded.length}\\b`).test(answer),
        { expected: [refunded.length, total] },
      );
    },
  },
  {
    id: "blog-navigate",
    tabs: ["/blog"],
    prompt:
      "Open the article about quantum dots in display panels from this blog index and tell me who wrote it and when it was published.",
    check: ({ answer }) =>
      result(
        has(
          answer,
          /ines okafor/i,
          /14 march 2026|march 14,? 2026|2026-03-14/i,
        ),
      ),
  },
  {
    // The post is only linked from the index: reading it needs no tab.
    id: "read-linked-post",
    tabs: ["/blog"],
    prompt:
      "Who wrote the post about quantum dots in display panels that this blog links to, and when was it published?",
    check: ({ answer }) =>
      result(
        has(
          answer,
          /ines okafor/i,
          /14 march 2026|march 14,? 2026|2026-03-14/i,
        ),
      ),
  },
  {
    id: "check-todos",
    tabs: ["/todos"],
    prompt:
      "Tick the checkbox of every task on this page that is due in March 2026, and only those.",
    async check({ page }) {
      const checked = await (
        await page("/todos")
      ).call(() =>
        [...document.querySelectorAll("#todos input:checked")].map((input) =>
          Number(input.dataset.id),
        ),
      );
      const expected = todoItems()
        .filter((item) => item.due.startsWith("2026-03"))
        .map((item) => item.id);
      const ok =
        checked.length === expected.length &&
        expected.every((id) => checked.includes(id));
      return result(ok, { checked: checked.length, expected: expected.length });
    },
  },
  {
    id: "live-wikipedia",
    live: true,
    informational: true,
    tabs: ["https://en.wikipedia.org/wiki/Web_browser"],
    prompt:
      "According to this Wikipedia article, who created the first web browser and in which year?",
    check: ({ answer }) => result(has(answer, /berners-lee/i, /1990/)),
  },
  {
    id: "live-hacker-news",
    live: true,
    tabs: ["https://news.ycombinator.com/"],
    prompt:
      "What is the title of the top story on this page right now, and how many points does it have?",
    // The top story can change during the run: either the one shown when
    // the prompt was sent or the one at check time counts, with its points
    // (which keep rising) within a margin.
    prepare: async ({ page }) => topStory(await page("news.ycombinator.com")),
    async check({ answer, page, prepared }) {
      const stories = [
        prepared,
        await topStory(await page("news.ycombinator.com")),
      ];
      const text = answer.toLowerCase().replace(/\s+/g, " ");
      const numbers = (answer.match(/\d[\d,]*/g) || []).map((value) =>
        Number(value.replace(/,/g, "")),
      );
      const ok = stories.some(
        (story) =>
          story?.words &&
          text.includes(story.words) &&
          numbers.some(
            (value) =>
              Math.abs(value - story.points) <= Math.max(5, story.points * 0.2),
          ),
      );
      return result(ok, { stories });
    },
  },
  {
    id: "live-wikipedia-search",
    live: true,
    tabs: ["https://en.wikipedia.org/wiki/Main_Page"],
    prompt:
      "Use Wikipedia's own search box on this page to find the article about Ada Lovelace, open it, and tell me her date of birth.",
    // The article must have been opened, not answered from memory.
    async check({ answer, page }) {
      const opened = await page("wikipedia.org/wiki/Ada_Lovelace")
        .then(() => true)
        .catch(() => false);
      return result(
        opened && has(answer, /10 december 1815|december 10,? 1815/i),
        { opened },
      );
    },
  },
];

async function topStory(tab) {
  const story = await tab.call(() => {
    const title = document.querySelector(".titleline > a")?.textContent || "";
    const score = document.querySelector(".score")?.textContent || "";
    return { title, points: parseInt(score, 10) || 0 };
  });
  return {
    ...story,
    words: story.title.toLowerCase().split(/\s+/).slice(0, 4).join(" "),
  };
}
