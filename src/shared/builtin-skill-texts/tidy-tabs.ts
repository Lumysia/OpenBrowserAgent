// Design sources: docs/credits.md.
export const tidyTabs = {
  name: "tidy-tabs",
  description:
    'Tidy the user\'s browser tabs: close duplicates, group related tabs, find ones no longer needed. Use for "tidy/organise/clean up my tabs", "too many tabs", "close duplicates", "group my tabs".',
  body: `# Tidy tabs

## 1. Look

- \`tabs\` list. Sort the tabs into:
  - duplicates: the same page (same URL, ignoring #fragments and tracking parameters);
  - related sets: the same site, topic or task (for example three product pages being compared);
  - probably done: search result pages, sign-in or confirmation pages, blank tabs;
  - keep as they are: the active tab, pinned or playing tabs, tabs with a form being filled, and groups the user already made.

## 2. Plan

- Duplicates: keep one copy (the active or first one) and close the others.
- Groups: one group per related set, with a short title (1–3 words) and a colour.
- Probably done: suggest closing them; never close them on a guess.

## 3. Confirm

- Grouping is harmless and can be undone, so you may do it right away.
- Closing cannot be undone. Unless the user already told you to go ahead, show the plan as a short list and ask (\`ask\`) before closing anything.

## 4. Act

- Close with one \`tabs\` close call (tabIds), then one \`tabs\` group call per set.
- Report what you closed (titles), the groups you made and the tab count before and after.
`,
};
