import { TOOL_NAME } from "../../shared/tool-names";
import { callPage } from "../page-agent";
import type { Step } from "./act-steps";
import type { RunContext } from "./types";

// In the check run of a recorded skill nothing submits a form until the
// user said so: a step that would submit (see page/form-submit.ts) runs
// only after an ask question with confirmSubmit set to the step's control
// or field was answered with the product's own Submit choice in this run
// (ask.ts). Each confirmation allows one submit.

const POSSIBLY_SUBMITTING = new Set(["click", "press", "type"]);

// Why the step may not run now, or undefined when it may.
export async function refuseUnconfirmedSubmit(
  run: Pick<RunContext, "skillCheck">,
  tabId: number,
  step: Step,
  signal?: AbortSignal,
) {
  const check = run.skillCheck;
  if (!check || !POSSIBLY_SUBMITTING.has(step.action)) return undefined;
  const { value: ref } = await callPage<string | null>(
    tabId,
    "submits",
    { step },
    signal,
  );
  if (!ref) return undefined;
  if (check.confirmedSubmits.delete(ref)) return undefined;
  return `This step submits a form, and this is a check run: ask the user first. Call ${TOOL_NAME.ask} with one question that has confirmSubmit: "${ref}" (its options are set for you), then repeat this step only if they choose to submit.`;
}
