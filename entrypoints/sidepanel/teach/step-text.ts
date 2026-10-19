import type { Messages } from "../../../src/shared/i18n";
import {
  TEACH_STEP_KIND,
  type TeachStep,
} from "../../../src/shared/teach/types";
import { formatMessage } from "../../../src/shared/text";

// A recorded step in a line for the user: what was done to which element,
// named the way the page names it (never a typed value).

function targetName(step: TeachStep, t: Messages) {
  const target = step.target;
  const name =
    target?.label || target?.name || target?.placeholder || target?.href;
  return name || t.teach.step.page;
}

export function teachStepText(step: TeachStep, t: Messages) {
  const words = t.teach.step;
  const target = targetName(step, t);
  switch (step.kind) {
    case TEACH_STEP_KIND.click:
      return formatMessage(words.click, { target });
    case TEACH_STEP_KIND.field:
      return formatMessage(
        step.field?.submitted ? words.fieldSubmitted : words.field,
        { target },
      );
    case TEACH_STEP_KIND.choose:
      return step.field?.secret
        ? formatMessage(words.chooseSecret, { target })
        : formatMessage(words.choose, {
            target,
            choice: step.choice || "",
          });
    case TEACH_STEP_KIND.toggle:
      return formatMessage(step.checked ? words.check : words.uncheck, {
        target,
      });
    case TEACH_STEP_KIND.key:
      return formatMessage(words.key, { key: step.key || "" });
    case TEACH_STEP_KIND.navigate:
      return formatMessage(words.navigate, { url: step.page.url });
    case TEACH_STEP_KIND.openTab:
      return formatMessage(words.openTab, { url: step.page.url });
    case TEACH_STEP_KIND.switchTab:
      return formatMessage(words.switchTab, { site: step.site || "" });
  }
}
