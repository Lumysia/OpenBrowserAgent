import type { AiStreamResponse, ContextBudgetReport } from "../shared/types";

export function postContextBudget(
  post: (message: AiStreamResponse) => void,
  budget: ContextBudgetReport,
) {
  post({ type: "metrics", metrics: { contextBudget: budget } });
}
