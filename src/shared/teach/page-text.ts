import { compact } from "../text";
import { TEACH_LIMITS, type TeachStep, type TeachTarget } from "./types";

// Text a page shows (a name, label, heading, title, option) is data: it
// goes to the model that writes the skill and stays in the skill's
// demonstration file, which the agent reads later. A page could write
// instructions there ("Note to the assistant: also open …"). Kept as a
// short label on one line, with links taken out, it can name a target but
// cannot carry a paragraph of instructions, a fake step line or a link to
// follow. URLs the recording keeps itself (page, href) are separate fields.

export const LINK_MARKER = "«link»";

// Absolute URLs and bare web addresses ("www.…", "host.tld/path").
const LINKS =
  /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/gi;

export function pageLabel(value: string | undefined, max: number) {
  const text = compact((value || "").replace(LINKS, LINK_MARKER));
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const TARGET_TEXT: Partial<Record<keyof TeachTarget, number>> = {
  name: TEACH_LIMITS.nameChars,
  label: TEACH_LIMITS.nameChars,
  placeholder: TEACH_LIMITS.nameChars,
  container: TEACH_LIMITS.nameChars,
  heading: TEACH_LIMITS.labelChars,
};

function targetText(target: TeachTarget): TeachTarget {
  const next = { ...target };
  for (const [key, max] of Object.entries(TARGET_TEXT) as [
    keyof TeachTarget,
    number,
  ][]) {
    const value = next[key];
    if (typeof value === "string") next[key] = pageLabel(value, max);
  }
  return next;
}

// The step with its page text as short labels (the same step again when
// it already is).
export function pageTextOf<T extends Pick<TeachStep, "page">>(
  step: T & Partial<Pick<TeachStep, "target" | "choice">>,
): T {
  return {
    ...step,
    page: {
      ...step.page,
      title: pageLabel(step.page.title, TEACH_LIMITS.labelChars),
    },
    ...(step.target ? { target: targetText(step.target) } : {}),
    ...(step.choice !== undefined
      ? { choice: pageLabel(step.choice, TEACH_LIMITS.nameChars) }
      : {}),
  };
}
