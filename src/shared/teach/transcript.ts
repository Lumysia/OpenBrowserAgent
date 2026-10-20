import { pageTextOf } from "./page-text";
import { isSecretStep } from "./secret-fields";
import { currentPage } from "./steps";
import {
  TEACH_STEP_KIND,
  type TeachSession,
  type TeachStep,
  type TeachTarget,
} from "./types";

// The recording as text for the model that writes the skill: numbered
// steps with their targets in words and the pages as URL patterns. Typed
// values are not in the recording; the transcript marks where they were.

const quoted = (value: string) => `"${value.replace(/"/g, "'")}"`;

export function describeTarget(target: TeachTarget | undefined) {
  if (!target) return "the page";
  const parts = [
    `${target.role || target.tag}${target.name ? ` ${quoted(target.name)}` : ""}`,
  ];
  if (target.label && target.label !== target.name)
    parts.push(`labelled ${quoted(target.label)}`);
  if (target.placeholder && target.placeholder !== target.name)
    parts.push(`placeholder ${quoted(target.placeholder)}`);
  if (target.nameAttribute) parts.push(`name=${target.nameAttribute}`);
  if (target.id) parts.push(`id=${target.id}`);
  if (target.href) parts.push(`to ${target.href}`);
  if (target.container) parts.push(`in ${target.container}`);
  if (target.heading) parts.push(`under heading ${quoted(target.heading)}`);
  return parts.join(", ");
}

// What a field is called for the user and the model: "Email".
export function fieldLabel(target: TeachTarget | undefined) {
  return (
    target?.label ||
    target?.name ||
    target?.placeholder ||
    target?.nameAttribute ||
    "field"
  );
}

function fieldText(step: TeachStep) {
  const field = step.field!;
  const label = fieldLabel(step.target);
  const value = isSecretStep(step)
    ? `«secret value withheld: field '${label}' (sensitive input: never store or ask for it in chat)»`
    : field.example
      ? `example value ${quoted(field.example)}`
      : `«value withheld: field '${label}'»`;
  return `Type into ${describeTarget(step.target)} (${field.inputType}, ${field.length} characters) ${value}${field.submitted ? ", then press Enter" : ""}`;
}

export function stepText(recorded: TeachStep) {
  const step = pageTextOf(recorded);
  const target = describeTarget(step.target);
  switch (step.kind) {
    case TEACH_STEP_KIND.click:
      return `Click ${target}`;
    case TEACH_STEP_KIND.field:
      return fieldText(step);
    case TEACH_STEP_KIND.choose:
      return step.field?.secret
        ? `Choose an option in ${target} «choice withheld: secret field '${fieldLabel(step.target)}'»`
        : `Choose ${quoted(step.choice || "")} in ${target}`;
    case TEACH_STEP_KIND.toggle:
      return `${step.checked ? "Check" : "Uncheck"} ${target}`;
    case TEACH_STEP_KIND.key:
      return `Press ${step.key}${step.target ? ` in ${target}` : ""}`;
    case TEACH_STEP_KIND.navigate:
      return `Go to ${step.page.url}`;
    case TEACH_STEP_KIND.openTab:
      return `A new tab opened at ${step.page.url}; the next steps happen there`;
    case TEACH_STEP_KIND.switchTab:
      return `The user switched to a tab on ${step.site} (not recorded)`;
  }
}

export function buildTranscript(
  session: Pick<
    TeachSession,
    "steps" | "startUrl" | "purpose" | "varies" | "dropped"
  >,
) {
  const lines = [
    `Recording that started at ${session.startUrl} and ended at ${currentPage(session.steps, session.startUrl)}, ${session.steps.length} steps.`,
  ];
  if (session.purpose)
    lines.push(`What it is for (the user's words): ${session.purpose}`);
  if (session.varies)
    lines.push(`What changes each time (the user's words): ${session.varies}`);
  if (session.dropped)
    lines.push(
      `${session.dropped} later steps were not recorded (the recording was full).`,
    );
  lines.push("", "Steps:");
  let page = "";
  session.steps.map(pageTextOf).forEach((step, index) => {
    if (step.kind !== TEACH_STEP_KIND.switchTab && step.page.url !== page) {
      page = step.page.url;
      lines.push(
        `On page ${step.page.title ? `${quoted(step.page.title)} ` : ""}(${page}):`,
      );
    }
    const result = step.leadsTo ? ` → the page changes to ${step.leadsTo}` : "";
    const varies = step.varies ? " [the user marked: changes each time]" : "";
    lines.push(`${index + 1}. ${stepText(step)}${result}${varies}`);
  });
  return lines.join("\n");
}
