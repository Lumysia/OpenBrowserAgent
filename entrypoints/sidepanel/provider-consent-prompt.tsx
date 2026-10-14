import { ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES } from "../../src/shared/default-preferences";
import type { Messages } from "../../src/shared/i18n";
import {
  chooseChatModel,
  chooseHelperModel,
  type ModelChoice,
} from "../../src/shared/model-choice";
import {
  grantProviderConsent,
  providerConsentHost,
  providerHasConsent,
} from "../../src/shared/provider-consent";
import type { Agent, Preferences, ProviderState } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import { providerConsentAgreement } from "../../src/ui/provider-display";

type Question = {
  host: string;
  answer: (allowed: boolean) => void;
};

// The models a send uses, as the background picks them: the chat's (the
// agent's own, else the selected one), the helper model and, for a new
// chat, the title's.
function sendModelChoices(
  providers: ProviderState,
  preferences: Preferences,
  agent: Agent,
  titled: boolean,
) {
  const selected = preferences.selectedModelId;
  return [
    chooseChatModel(providers, preferences, agent.modelId, selected),
    chooseHelperModel(providers, preferences.helperModelId),
    titled ? chooseChatModel(providers, preferences, selected) : undefined,
  ];
}

// Before a send, the providers it would use that lack the user's permission
// to receive their content are asked about one by one, above the composer.
// Nothing is sent unless the user agrees to each.
export function useProviderConsent(
  t: Messages,
  providers: ProviderState | undefined,
  preferences: Preferences | undefined,
  agent: Agent,
) {
  const [question, setQuestion] = useState<Question>();
  const asking = useRef(false);

  async function confirmProviders(choices: Array<ModelChoice | undefined>) {
    if (asking.current) return false;
    const missing = new Map<string, string>();
    for (const choice of choices)
      if (choice && !providerHasConsent(choice.provider))
        missing.set(choice.providerId, providerConsentHost(choice.provider));
    asking.current = true;
    try {
      for (const [providerId, host] of missing) {
        const allowed = await new Promise<boolean>((answer) =>
          setQuestion({ host, answer }),
        );
        setQuestion(undefined);
        if (!allowed || !(await grantProviderConsent(providerId, host)))
          return false;
      }
      return true;
    } finally {
      asking.current = false;
    }
  }

  const prompt: ReactNode = question && (
    <ProviderConsentPrompt
      key={question.host}
      t={t}
      host={question.host}
      onAnswer={question.answer}
    />
  );
  // `titled`: the send starts a chat, which then gets a generated title.
  const confirmSend = (titled: boolean) =>
    confirmProviders(
      sendModelChoices(
        providers || {},
        preferences || DEFAULT_PREFERENCES,
        agent,
        titled,
      ),
    );
  return { confirmSend, prompt };
}

function ProviderConsentPrompt({
  t,
  host,
  onAnswer,
}: {
  t: Messages;
  host: string;
  onAnswer: (allowed: boolean) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Focus moves to the question and back where it was (the composer).
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="composer-card provider-consent-prompt"
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onAnswer(false);
      }}
    >
      <div className="composer-card-header">
        <strong id={`${id}-title`}>
          <ShieldCheck size={15} aria-hidden="true" />
          {t.providerConsent.promptTitle}
        </strong>
        <small id={`${id}-text`}>
          {providerConsentAgreement(host, t.providerConsent)}
        </small>
      </div>
      <div className="provider-consent-prompt-actions">
        <Button variant="outline" size="sm" onClick={() => onAnswer(false)}>
          {t.providerConsent.decline}
        </Button>
        <Button size="sm" onClick={() => onAnswer(true)}>
          {t.providerConsent.allow}
        </Button>
      </div>
    </div>
  );
}
