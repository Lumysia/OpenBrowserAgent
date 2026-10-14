import type { Messages } from "../../src/shared/i18n";

// Small label helpers shared by the tool detail lines.

export type ToolRecord = Record<string, unknown>;

export type ToolStepState = "running" | "done" | "failed";

// What came of a step, for tools whose title says so rather than the tool's
// name. `description` replaces the step line when given.
export type ToolStepOutcome = {
  title: string;
  failed?: boolean;
  description?: string;
};

export function shortValue(value: unknown, maxLength = 140) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function compactJoin(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}

// The localized word for a tool's `action` argument. An unknown one (from
// a newer version, say) shows nothing rather than the raw English name.
export function actionLabel(action: unknown, t: Messages) {
  return knownLabel(t.display.toolSteps.actions, action);
}

export function knownLabel(labels: Record<string, string>, key: unknown) {
  const name = stringValue(key);
  return Object.hasOwn(labels, name) ? labels[name] : "";
}
