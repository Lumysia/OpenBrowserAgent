import { useEffect, useRef, useState } from "react";
import { providerHasConsent } from "../../src/shared/provider-consent";
import { normalizeProviderConfig } from "../../src/shared/provider-instances";
import { sameJson } from "../../src/shared/sync/codec";
import type { ProviderConfig } from "../../src/shared/types";
import { useAutoSave } from "../../src/ui/use-auto-save";

// A provider's form state: edits save as they are made, except the API key,
// which waits for the permission to send content to the provider. A stored
// value that differs from what the form saved last came from elsewhere
// (another page, sync) and replaces the form's.
export function useProviderDraft(
  providerId: string,
  value: ProviderConfig,
  onChange: (value: ProviderConfig) => void,
) {
  const [draft, setDraft] = useState(value);
  const consentMissing = !providerHasConsent(draft);
  const toSave = consentMissing ? { ...draft, apiKey: value.apiKey } : draft;
  const lastSaved = useRef(value);

  useEffect(() => {
    if (sameJson(value, lastSaved.current)) return;
    lastSaved.current = value;
    setDraft(value);
  }, [value]);

  useAutoSave(toSave, value, (next) => {
    // As it comes back from storage (ProviderList normalizes it).
    lastSaved.current = normalizeProviderConfig(providerId, next);
    onChange(next);
  });

  return {
    draft,
    setDraft,
    // The typed key is not stored yet.
    keyUnsaved: (draft.apiKey || "") !== (value.apiKey || ""),
  };
}
