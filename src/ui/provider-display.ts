import type { Messages } from "../shared/i18n";
import { providerLabels, type ProviderId } from "../shared/types";

// The kind of API a provider speaks, in the UI language. Brand names stay
// as they are; only words like "compatible" are translated.
export function providerTypeLabel(type: ProviderId, t: Messages) {
  const labels: Partial<Record<ProviderId, string>> = t.display.providerTypes;
  return labels[type] || providerLabels[type] || type;
}
