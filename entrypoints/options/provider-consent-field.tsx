import { ShieldCheck } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import {
  providerConsentHost,
  providerHasConsent,
  providerNeedsConsent,
  withProviderConsent,
} from "../../src/shared/provider-consent";
import type { ProviderConfig } from "../../src/shared/types";
import { Button, Checkbox, Feedback } from "../../src/ui/components";
import { providerConsentAgreement } from "../../src/ui/provider-display";

// The user's permission for the provider to receive their content: a
// required checkbox naming the endpoint's host, or, once saved for that
// host, its state with a way to withdraw it. Local endpoints need none.
export function ProviderConsentField({
  t,
  saved,
  draft,
  dirty,
  onDraftChange,
  onWithdraw,
}: {
  t: Messages;
  saved: ProviderConfig;
  draft: ProviderConfig;
  dirty: boolean;
  onDraftChange: (value: ProviderConfig) => void;
  onWithdraw: () => void;
}) {
  const host = providerConsentHost(draft);
  if (!providerNeedsConsent(draft))
    return host ? (
      <p className="muted provider-consent-note">
        {t.providerConsent.localEndpoint.replace("{host}", host)}
      </p>
    ) : null;
  if (providerHasConsent(saved) && providerConsentHost(saved) === host)
    return (
      <div className="provider-consent-status">
        <ShieldCheck size={16} aria-hidden="true" />
        <span className="provider-consent-summary">
          <strong>{t.providerConsent.allowed}</strong>
          <small title={host}>{host}</small>
        </span>
        <Button variant="ghost" size="sm" onClick={onWithdraw}>
          {t.providerConsent.withdraw}
        </Button>
      </div>
    );
  const allowed = providerHasConsent(draft);
  return (
    <div className="provider-consent-field">
      <Checkbox
        checked={allowed}
        aria-required="true"
        onCheckedChange={(checked) =>
          onDraftChange(withProviderConsent(draft, checked))
        }
      >
        {providerConsentAgreement(host, t.providerConsent)}
      </Checkbox>
      {dirty && !allowed && (
        <Feedback className="provider-consent-note">
          {t.providerConsent.requiredToSave}
        </Feedback>
      )}
    </div>
  );
}
