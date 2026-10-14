import {
  formatCount,
  resolveLanguage,
  type Messages,
} from "../../src/shared/i18n";
import { stringValue } from "./tool-detail-format";

type ActSteps = Messages["display"]["toolSteps"]["actSteps"];

// What the steps of one act call did, counted per kind in the order they
// first ran, e.g. "Typed in 2 fields, selected 2 options, clicked 1
// element".
export function actStepsSummary(steps: unknown[], t: Messages) {
  const messages: ActSteps = t.display.toolSteps.actSteps;
  const counts = new Map<keyof ActSteps, number>();
  for (const step of steps) {
    const action = stringValue((step as { action?: unknown })?.action);
    const kind =
      action && action !== "other" && Object.hasOwn(messages, action)
        ? (action as keyof ActSteps)
        : "other";
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  if (!counts.size) return "";
  const language = resolveLanguage();
  const parts = [...counts]
    .sort(([a], [b]) => Number(a === "other") - Number(b === "other"))
    .map(([kind, count]) => formatCount(messages[kind], count));
  const text = parts.join(t.display.toolSteps.actStepSeparator);
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}
