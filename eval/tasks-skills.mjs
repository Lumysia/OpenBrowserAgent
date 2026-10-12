import { orderRows } from "./fixture-pages-apps.mjs";
import { catalogItems, loadMoreItems } from "./fixture-pages-skills.mjs";

// Tasks for built-in skills and for candidates that did not beat the agent
// without them (deep-research, compare, collect-data, fact-check); `skill`
// names the skill each task measures. Run them with skills on and with
// `--skills off` to see what a skill changes.
const result = (ok, detail) => ({ ok: !!ok, detail });
const lastPost = (posts, path) =>
  posts.filter((post) => post.path === path).at(-1);
const citations = (answer) =>
  new Set(answer.match(/\[\[cite:[^\]]+\]\]/g) || []).size;
// The lines of the answer that talk about something.
const linesAbout = (answer, pattern) =>
  answer.split("\n").filter((line) => pattern.test(line));
const NEGATIVE =
  /false|incorrect|wrong|inaccurate|outdated|misleading|not (true|accurate|correct|supported)|❌|✗/i;
const POSITIVE = /true|correct|accurate|confirmed|supported|✅|✓/i;
const VERDICT = new RegExp(`${NEGATIVE.source}|${POSITIVE.source}`, "i");

const TIDY_TABS = [
  "/laptop/a",
  "/news",
  "/laptop/b",
  "/laptop/a",
  "/help",
  "/laptop/c",
  "/news",
  "/orders",
];
const openTabs = (panel) =>
  panel.call(async () =>
    (await chrome.tabs.query({}))
      .filter((tab) => tab.url?.startsWith("http"))
      .map((tab) => ({ path: new URL(tab.url).pathname, group: tab.groupId })),
  );

// Every item is in the answer once, as a data row (name, then the price).
function checkRows(answer, items) {
  const lines = answer.split("\n");
  const rows = (name) =>
    lines.filter((line) =>
      new RegExp(`^\\W*${name}\\W*[,;\\t|]\\s*\\W*\\d`).test(line.trim()),
    ).length;
  const missing = items.filter((item) => !rows(item.name)).length;
  const duplicated = items.filter((item) => rows(item.name) > 1).length;
  return result(!missing && !duplicated, { missing, duplicated });
}

export const SKILL_TASKS = [
  {
    id: "skill-deep-research",
    skill: "deep-research",
    tabs: ["/research"],
    prompt:
      "Research this for me: what is the latest on Vellmar's harbour ferry electrification — budget, number of ferries and when electric service starts? Start from this topic guide and give me a short brief.",
    check({ answer }) {
      const facts = {
        budget: /48[.,]6/.test(answer),
        ferries:
          /\b(four|4)\b[^.\n]{0,40}ferr|ferr[^.\n]{0,40}\b(four|4)\b/i.test(
            answer,
          ),
        start: /2028/.test(answer),
        delayRisk: /2029/.test(answer) && /(^|\D)53(\D|$)/.test(answer),
        // The unsourced blog figure must not be reported as the budget.
        noBlogFigure:
          !/60 million|€60/i.test(answer) ||
          /blog|unsourced|unverified|rumou?r|claim/i.test(answer),
        cited: citations(answer) >= 3,
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-compare",
    skill: "compare",
    tabs: ["/laptop/a", "/laptop/b", "/laptop/c"],
    prompt:
      "I travel a lot and my budget is $1,400. Compare the three laptops in my tabs and tell me which one to buy.",
    check({ answer }) {
      const facts = {
        all: [/altair 15/i, /corvid 14/i, /lumen 13/i].every((name) =>
          name.test(answer),
        ),
        batteries: [/\b11\b/, /\b17\b/, /\b14\b/].every((value) =>
          value.test(answer),
        ),
        weights: [/1[.,]62/, /1[.,]18/, /1[.,]09/].every((value) =>
          value.test(answer),
        ),
        table: /\|[^\n]*\|[^\n]*\|/.test(answer),
        overBudget: linesAbout(answer, /lumen/i).some((line) =>
          /budget|over|exceed|1[,.]?599|too expensive/i.test(line),
        ),
        // Corvid 14 costs $1,428 with its shipping: over the budget.
        shipping: /\b79\b|1[,.]?428/.test(answer),
        pick:
          /(recommend|buy|pick|go with|choose)[^\n]{0,80}altair 15|altair 15[^\n]{0,80}(recommend|best pick|winner|within (your )?budget)/i.test(
            answer,
          ) ||
          linesAbout(answer, /corvid/i).some((line) =>
            /1[,.]?428|over (your |the )?budget|exceeds?|above (your |the )?budget/i.test(
              line,
            ),
          ),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-collect-data",
    skill: "collect-data",
    tabs: ["/catalog"],
    prompt:
      "Collect every product in this catalogue — all pages — with its name and price, and give me the data as CSV.",
    check: ({ answer }) => checkRows(answer, catalogItems()),
  },
  {
    id: "skill-collect-data-more",
    skill: "collect-data",
    tabs: ["/catalog-more"],
    prompt:
      "Get me every product on this page with its price as CSV. I need all of them.",
    check: ({ answer }) => checkRows(answer, loadMoreItems()),
  },
  {
    id: "skill-fill-form",
    skill: "fill-form",
    tabs: ["/form"],
    prompt:
      "Fill in this sign-up form for me: name Mara Lindqvist, email mara.l@example.org, phone +46 70 123 45 67, country Sweden, Team plan, start date 2 November 2026. Don't sign me up for any newsletters.",
    async check({ posts, page }) {
      const form = await (
        await page("/form")
      ).call(() => {
        const f = document.getElementById("signup");
        return {
          name: f.name.value,
          email: f.email.value,
          phone: f.phone.value.replace(/\D/g, ""),
          country: f.country.value,
          plan: f.plan.value,
          start: f.start.value,
          newsletter: f.newsletter.checked,
        };
      });
      const expected = {
        name: "Mara Lindqvist",
        email: "mara.l@example.org",
        phone: "46701234567",
        country: "Sweden",
        plan: "team",
        start: "2026-11-02",
        newsletter: false,
      };
      const wrong = Object.keys(expected).filter(
        (key) => form[key] !== expected[key],
      );
      // Not asked to submit: the form waits for the user.
      if (lastPost(posts, "/api/submit")) wrong.push("submitted");
      return result(!wrong.length, { wrong });
    },
  },
  {
    // Asked to submit, but the required email is missing: it must not be
    // made up.
    id: "skill-fill-form-missing",
    skill: "fill-form",
    tabs: ["/form"],
    prompt:
      "Fill in this sign-up form and submit it: name Mara Lindqvist, country Sweden, Team plan.",
    allowQuestion: true,
    check({ posts, answer, question }) {
      const sent = lastPost(posts, "/api/submit")?.data;
      const facts = {
        noInventedEmail: !sent?.email,
        mentionsEmail: /e-?mail/i.test(`${answer}\n${question || ""}`),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-fact-check",
    skill: "fact-check",
    tabs: ["/factcheck"],
    prompt: "Fact-check this post for me.",
    check({ answer }) {
      // The first verdict word on a line about the claim decides; the
      // explanation after it may mention outdated sources.
      const verdict = (about, expected) =>
        linesAbout(answer, about).some((line) => {
          const word = line.match(VERDICT)?.[0];
          return !!word && NEGATIVE.test(word) !== expected;
        });
      const claims = {
        budget:
          verdict(/60 million|€60|\b60\b/i, false) && /48[.,]6/.test(answer),
        ferries: verdict(
          /\b(four|4)\b[^\n]*ferr|ferr[^\n]*\b(four|4)\b/i,
          true,
        ),
        charging: verdict(/12 min/i, true),
        start: verdict(/2026/, false) && /2028/.test(answer),
        passengers: verdict(/\b500\b/, false) && /\b300\b/.test(answer),
        cited: citations(answer) >= 2,
      };
      return result(Object.values(claims).every(Boolean), claims);
    },
  },
  {
    id: "skill-tidy-tabs",
    skill: "tidy-tabs",
    tabs: TIDY_TABS,
    prompt:
      "My tabs are a mess. Tidy them up: close duplicate tabs and group related ones. Go ahead, you don't need to ask me.",
    async check({ panel }) {
      const tabs = await openTabs(panel);
      const count = (path) => tabs.filter((tab) => tab.path === path).length;
      const laptops = tabs.filter((tab) => tab.path.startsWith("/laptop/"));
      const facts = {
        noDuplicates: ["/laptop/a", "/news"].every((path) => count(path) === 1),
        keptUnique: ["/laptop/b", "/laptop/c", "/help", "/orders"].every(
          (path) => count(path) === 1,
        ),
        laptopsGrouped:
          laptops.length === 3 &&
          laptops[0].group !== -1 &&
          laptops.every((tab) => tab.group === laptops[0].group),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    // Without a go-ahead, nothing is closed before the user agrees.
    id: "skill-tidy-tabs-confirm",
    skill: "tidy-tabs",
    tabs: TIDY_TABS,
    prompt: "My tabs are a mess, can you tidy them up?",
    allowQuestion: true,
    async check({ panel, answer, question }) {
      const paths = (await openTabs(panel)).map((tab) => tab.path);
      const facts = {
        nothingClosed: paths.length === TIDY_TABS.length,
        proposed: /duplicate/i.test(`${answer}\n${question || ""}`),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-help",
    skill: "openbrowseragent-help",
    tabs: ["/article"],
    prompt:
      "How do I stop OpenBrowserAgent from using one of its built-in skills on its own, while still being able to use it when I want? And how do I pick it for a single message?",
    check({ answer }) {
      const facts = {
        manual: /manual/i.test(answer),
        where: /skills/i.test(answer) && /(options|settings)/i.test(answer),
        slash: /(^|[\s`"“(])\/([\s`"”)]|[a-z])/im.test(answer),
        plus: /["“`]?\+["”`]?/.test(answer),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-creator",
    skill: "skill-creator",
    tabs: ["/orders"],
    prompt:
      "How many orders in this table have the status Refunded, and what is their total amount?",
    followUps: [
      "Great. Save what we just did as a skill so I can run the same check next month.",
    ],
    async check({ panel }) {
      const refunded = orderRows().filter((row) => row.status === "Refunded");
      const total = refunded.reduce((sum, row) => sum + row.amount, 0);
      const skills = await panel.call(
        async () => (await chrome.storage.local.get("skills")).skills || [],
      );
      const skill = skills.at(-1);
      const body =
        skill?.files?.find((file) => file.path === "SKILL.md")?.content || "";
      const facts = {
        created: !!skill,
        kebabName: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill?.name || ""),
        description: (skill?.description || "").length >= 40,
        procedure: /refunded/i.test(body) && /\n\s*(1\.|-)\s/.test(body),
        // This month's result is a one-off detail, not part of the skill.
        noOneOffResult: !new RegExp(
          `\\b${String(total).replace(/(\d)(?=(\d{3})+$)/, "$1[,.]?")}\\b`,
        ).test(body),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
  {
    id: "skill-bridge-setup",
    skill: "local-execution-bridge-setup",
    tabs: ["/article"],
    prompt:
      "Run `ls ~/Downloads` on my computer and tell me what is in that folder.",
    followUps: [
      "Yes, set it up. I use Chrome and the extension ID is abcdefghijklmnopabcdefghijklmnop.",
    ],
    allowQuestion: true,
    check({ answer, question }) {
      const text = `${answer}\n${question || ""}`;
      const facts = {
        installer:
          /openbrowseragent-local-execution-bridge[^\n]*install[^\n]*abcdefghijklmnopabcdefghijklmnop/.test(
            text,
          ),
        extensionId: /extension[\s-]?id/i.test(text),
        browser: /browser/i.test(text),
        // It does not hand the task back to the user.
        noManualRun: !/(open|in) (a|your) terminal and run `?ls/i.test(text),
      };
      return result(Object.values(facts).every(Boolean), facts);
    },
  },
];
