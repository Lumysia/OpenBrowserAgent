import { toolStepsLeftNote } from "../shared/model-notes";

// When a run with `max` tool steps tells the model how many are left: once
// when few remain (5, or a tenth of the limit if more), and at the last one.
const LOW_STEPS = 5;
const LOW_SHARE = 0.1;

export function toolBudget(max: number) {
  const low = Math.max(LOW_STEPS, Math.ceil(max * LOW_SHARE));
  let warned = false;
  let ended = false;
  return {
    // The note for the results of the step after `done` finished steps,
    // given once per step (parallel calls share a step).
    note(done: number) {
      const left = max - done - 1;
      if (left < 0) return "";
      if (left === 0) {
        if (ended) return "";
        ended = true;
        return toolStepsLeftNote(0);
      }
      if (warned || left > low) return "";
      warned = true;
      return toolStepsLeftNote(left);
    },
  };
}
