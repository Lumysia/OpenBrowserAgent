const KEYS = [
  "modelCalls",
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "wallMs",
];

export function summarize(results) {
  const group = (items) => {
    const total = Object.fromEntries(
      KEYS.map((key) => [
        key,
        items.reduce((sum, item) => sum + (item[key] || 0), 0),
      ]),
    );
    return {
      tasks: items.length,
      passed: items.filter((item) => item.ok).length,
      ...total,
      cachedShare: total.inputTokens
        ? round(total.cachedInputTokens / total.inputTokens)
        : 0,
      largestRequestTokens: Math.max(
        0,
        ...items.map((item) => item.largestRequest?.inputTokens || 0),
      ),
    };
  };
  return {
    all: group(results),
    local: group(results.filter((item) => !item.live)),
    live: group(results.filter((item) => item.live)),
  };
}

const round = (value) => Math.round(value * 1000) / 1000;
const k = (value) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value ?? 0);
const percent = (part, whole) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "-";
const tools = (calls) =>
  Object.entries(calls || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}×${count}`)
    .join(" ");

export function renderReport(report, baseline) {
  const lines = [
    `# Eval ${report.meta.date.slice(0, 16)} (${report.meta.branch}@${report.meta.commit}, ${report.meta.provider}/${report.meta.model})`,
    "",
    "Live tasks hit real websites and are unstable; compare them with care.",
    "",
    "| Task | OK | Calls | Input | Cached | Output | Largest req | Wall | Tools |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.tasks.map(
      (task) =>
        `| ${task.id}${task.live ? " (live)" : ""} | ${task.ok ? "yes" : "**no**"} | ${task.modelCalls ?? "-"} | ${k(task.inputTokens)} | ${percent(task.cachedInputTokens, task.inputTokens)} | ${k(task.outputTokens)} | ${k(task.largestRequest?.inputTokens)} | ${Math.round((task.wallMs || 0) / 1000)}s | ${tools(task.toolCalls)} |`,
    ),
    "",
    "| Group | Passed | Calls | Input | Cached | Output | Largest req | Wall |",
    "|---|---|---|---|---|---|---|---|",
    ...Object.entries(report.totals).map(
      ([name, total]) =>
        `| ${name} | ${total.passed}/${total.tasks} | ${total.modelCalls} | ${k(total.inputTokens)} | ${percent(total.cachedInputTokens, total.inputTokens)} | ${k(total.outputTokens)} | ${k(total.largestRequestTokens)} | ${Math.round(total.wallMs / 1000)}s |`,
    ),
  ];
  const failed = report.tasks.filter((task) => !task.ok);
  if (failed.length)
    lines.push(
      "",
      "Failures:",
      ...failed.map((task) => `- ${task.id}: ${JSON.stringify(task.detail)}`),
    );
  if (baseline) lines.push("", ...renderComparison(report, baseline));
  return `${lines.join("\n")}\n`;
}

function renderComparison(report, baseline) {
  const before = new Map(baseline.tasks.map((task) => [task.id, task]));
  const delta = (after, prior) =>
    prior
      ? `${after >= prior ? "+" : ""}${Math.round(((after - prior) / prior) * 100)}%`
      : "-";
  return [
    `## Compared with ${baseline.meta.branch}@${baseline.meta.commit}`,
    "",
    "| Task | OK before → after | Calls | Input tokens | Uncached input | Cached share | Output |",
    "|---|---|---|---|---|---|---|",
    ...report.tasks.map((task) => {
      const prior = before.get(task.id);
      if (!prior) return `| ${task.id} | new | | | | | |`;
      const uncached = (item) => item.inputTokens - item.cachedInputTokens;
      return `| ${task.id} | ${prior.ok ? "yes" : "no"} → ${task.ok ? "yes" : "no"} | ${prior.modelCalls} → ${task.modelCalls} | ${k(prior.inputTokens)} → ${k(task.inputTokens)} (${delta(task.inputTokens, prior.inputTokens)}) | ${k(uncached(prior))} → ${k(uncached(task))} (${delta(uncached(task), uncached(prior))}) | ${percent(prior.cachedInputTokens, prior.inputTokens)} → ${percent(task.cachedInputTokens, task.inputTokens)} | ${k(prior.outputTokens)} → ${k(task.outputTokens)} |`;
    }),
  ];
}
