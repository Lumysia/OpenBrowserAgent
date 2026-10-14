import type { Messages } from "../shared/i18n";
import { providerLabels, type ProviderId } from "../shared/types";

// The kind of API a provider speaks, in the UI language. Brand names stay
// as they are; only words like "compatible" are translated.
export function providerTypeLabel(type: ProviderId, t: Messages) {
  const labels: Partial<Record<ProviderId, string>> = t.display.providerTypes;
  return labels[type] || providerLabels[type] || type;
}

// A provider name as shown. A new provider is stored with its type's English
// label as its name ("OpenAI-compatible"); while it keeps that name it shows
// in the UI language. A name the user chose shows as typed. Stored data is
// not changed.
export function providerNameDisplay(name: string, t: Messages) {
  const type = (Object.keys(providerLabels) as ProviderId[]).find(
    (id) => providerLabels[id] === name,
  );
  return type ? providerTypeLabel(type, t) : name;
}

// A model's stored "Provider / model" display name with the provider part
// shown as providerNameDisplay does.
export function modelNameDisplay(displayName: string, t: Messages) {
  const [provider, ...rest] = displayName.split(" / ");
  return rest.length
    ? [providerNameDisplay(provider.trim(), t), ...rest].join(" / ")
    : displayName;
}

// The sentence the user agrees to before a provider receives their content,
// the same in the provider form and the prompts before a request.
export function providerConsentAgreement(
  host: string,
  messages: Messages["providerConsent"],
) {
  return messages.agreement.replace("{host}", host);
}
