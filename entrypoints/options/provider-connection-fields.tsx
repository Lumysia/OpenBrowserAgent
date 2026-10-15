import type { Messages } from "../../src/shared/i18n";
import { withProviderConsent } from "../../src/shared/provider-consent";
import {
  providerBaseUrlPlacement,
  providerType,
} from "../../src/shared/providers";
import type { ProviderConfig } from "../../src/shared/types";
import { Input, Label } from "../../src/ui/components";
import { ProviderAdvanced } from "./provider-advanced";
import { ProviderBaseUrl } from "./provider-base-url";
import { ProviderConsentField } from "./provider-consent-field";

// Where a provider is and how to reach it: the base URL of a server the user
// names, the API key, the permission to send content there, and the rest
// under Advanced. The same fields in the provider editor and in setup.
export function ProviderConnectionFields({
  t,
  saved,
  draft,
  keyUnsaved,
  onDraftChange,
}: {
  t: Messages;
  saved: ProviderConfig;
  draft: ProviderConfig;
  keyUnsaved: boolean;
  onDraftChange: (value: ProviderConfig) => void;
}) {
  const provider = draft.type || "openai";
  return (
    <>
      {providerBaseUrlPlacement(provider) === "main" && (
        <ProviderBaseUrl t={t} value={draft} onChange={onDraftChange} />
      )}
      {!providerType(provider).keyless && (
        <Label>
          {t.options.apiKey}
          <Input
            type="password"
            value={draft.apiKey || ""}
            onChange={(event) =>
              onDraftChange({ ...draft, apiKey: event.target.value })
            }
          />
        </Label>
      )}
      <ProviderConsentField
        t={t}
        saved={saved}
        draft={draft}
        dirty={keyUnsaved}
        onDraftChange={onDraftChange}
        onWithdraw={() => onDraftChange(withProviderConsent(draft, false))}
      />
      <ProviderAdvanced t={t} value={draft} onChange={onDraftChange} />
    </>
  );
}
