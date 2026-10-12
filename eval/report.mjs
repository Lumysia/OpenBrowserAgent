const KEYS = [
  "modelCalls",
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "agentCalls",
  "agentInputTokens",
  "agentCachedInputTokens",
  "helperCalls",
  "helperInputTokens",
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
    const counted = items.filter((item) => !item.informational);
    return {
      // Informational tasks are reported but not counted as passed.
      tasks: counted.length,
      passed: counted.filter((item) => item.ok).length,
      informational: items.length - counted.length,
      ...total,
      cachedShare: total.inputTokens
        ? round(total.cachedInputTokens / total.inputTokens)
        : 0,
      largestRequestTokens: Math.max(
        0,
        ...items.map((item) => item.largestRequest?.inputTokens || 0),
      ),
      largestHelperRequestTokens: Math.max(
        0,
        ...items.map((item) => item.largestHelperRequestTokens || 0),
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
const okLabel = (task) =>
  task.informational
    ? `${task.ok ? "yes" : "no"} (info)`
    : task.ok
      ? "yes"
      : "**no**";

export function renderReport(report, baseline) {
  const lines = [
    `# Eval ${report.meta.date.slice(0, 16)} (build ${report.meta.commit}, ${report.meta.provider}/${report.meta.model})`,
    "",
    "Live tasks hit real websites and are unstable; compare them with care. Informational tasks (info) are not counted. Agent: the agent's own requests; helper: tool-less helper-model requests (extract, compaction, summaries).",
    "",
    "| Task | OK | Calls (agent+helper) | Agent input | Agent cached | Helper input | Output | Largest agent req | Wall | Tools |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...report.tasks.map(
      (task) =>
        `| ${task.id}${task.live ? " (live)" : ""} | ${okLabel(task)} | ${task.agentCalls ?? "-"}+${task.helperCalls ?? 0} | ${k(task.agentInputTokens)} | ${percent(task.agentCachedInputTokens, task.agentInputTokens)} | ${k(task.helperInputTokens)} | ${k(task.outputTokens)} | ${k(task.largestRequest?.inputTokens)} | ${Math.round((task.wallMs || 0) / 1000)}s | ${tools(task.toolCalls)} |`,
    ),
    "",
    "| Group | Passed | Calls (agent+helper) | Input (all) | Agent input | Agent cached | Helper input | Output | Largest agent req | Largest helper req | Wall |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...Object.entries(report.totals).map(
      ([name, total]) =>
        `| ${name} | ${total.passed}/${total.tasks}${total.informational ? ` (+${total.informational} info)` : ""} | ${total.agentCalls}+${total.helperCalls} | ${k(total.inputTokens)} | ${k(total.agentInputTokens)} | ${percent(total.agentCachedInputTokens, total.agentInputTokens)} | ${k(total.helperInputTokens)} | ${k(total.outputTokens)} | ${k(total.largestRequestTokens)} | ${k(total.largestHelperRequestTokens)} | ${Math.round(total.wallMs / 1000)}s |`,
    ),
  ];
  const failed = report.tasks.filter((task) => !task.ok);
  if (failed.length)
    lines.push(
      "",
      "Failures:",
      ...failed.map(
        (task) =>
          `- ${task.id}${task.informational ? " (info)" : ""}: ${JSON.stringify(task.detail)}`,
      ),
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
  const all = (item) => item.totals.all;
  const row = (label, value) =>
    `| ${label} | ${value(all(baseline))} | ${value(all(report))} |`;
  return [
    `## Compared with build ${baseline.meta.commit}`,
    "",
    "| | before | after |",
    "|---|---|---|",
    row("passed", (total) => `${total.passed}/${total.tasks}`),
    row("calls (agent+helper)", (t) => `${t.agentCalls}+${t.helperCalls}`),
    row("input (all)", (t) => k(t.inputTokens)),
    row("agent input", (t) => k(t.agentInputTokens)),
    row("agent cached", (t) =>
      percent(t.agentCachedInputTokens, t.agentInputTokens),
    ),
    row("helper input", (t) => k(t.helperInputTokens)),
    row("output", (t) => k(t.outputTokens)),
    row("largest agent request", (t) => k(t.largestRequestTokens)),
    row("largest helper request", (t) => k(t.largestHelperRequestTokens)),
    row("wall", (t) => `${Math.round(t.wallMs / 1000)}s`),
    "",
    "| Task | OK before → after | Calls | Agent input | Helper input | Uncached input | Output |",
    "|---|---|---|---|---|---|---|",
    ...report.tasks.map((task) => {
      const prior = before.get(task.id);
      if (!prior) return `| ${task.id} | new | | | | | |`;
      const uncached = (item) => item.inputTokens - item.cachedInputTokens;
      return `| ${task.id} | ${okLabel(prior)} → ${okLabel(task)} | ${prior.agentCalls}+${prior.helperCalls} → ${task.agentCalls}+${task.helperCalls} | ${k(prior.agentInputTokens)} → ${k(task.agentInputTokens)} (${delta(task.agentInputTokens, prior.agentInputTokens)}) | ${k(prior.helperInputTokens)} → ${k(task.helperInputTokens)} | ${k(uncached(prior))} → ${k(uncached(task))} (${delta(uncached(task), uncached(prior))}) | ${k(prior.outputTokens)} → ${k(task.outputTokens)} |`;
    }),
  ];
}
