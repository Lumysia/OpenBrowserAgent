import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  PanelRight,
  Languages,
  MousePointerClick,
  PartyPopper,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import {
  nextSetupStep,
  previousSetupStep,
  SETUP_STEPS,
  setupForwardAction,
  setupStepIndex,
  type SetupStep,
} from "../../src/shared/setup-steps";
import { Button, ScrollArea, StepDots } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useLatest } from "../../src/ui/use-latest";
import { useConfiguredModels } from "./model-select";
import { SetupDoneStep } from "./setup-done-step";
import { SetupPagesStep } from "./setup-pages-step";
import { SetupProviderStep } from "./setup-provider-step";
import { TranslateIntoSection } from "./translate-into";
import { UiLanguageSection } from "./ui-language-section";
import { useOpenSidePanel } from "./use-open-side-panel";
import { useSetupProgress } from "./use-setup-progress";

// Each step's icon and heading.
const STEPS: Record<
  SetupStep,
  {
    icon: LucideIcon;
    text: (t: Messages) => { title: string; description: string };
  }
> = {
  language: {
    icon: Languages,
    text: (t) => ({
      title: t.setup.languageTitle,
      description: t.setup.languageDescription,
    }),
  },
  provider: {
    icon: Server,
    text: (t) => ({
      title: t.setup.providerTitle,
      description: t.setup.providerDescription,
    }),
  },
  pages: {
    icon: MousePointerClick,
    text: (t) => ({
      title: t.setup.pagesTitle,
      description: t.setup.pagesDescription,
    }),
  },
  done: {
    icon: PartyPopper,
    text: (t) => ({
      title: t.setup.doneTitle,
      description: t.setup.doneDescription,
    }),
  },
};

// Where Enter belongs to the control (a button, a field, a list) instead
// of meaning "Next".
const OWN_ENTER =
  'a, button, input, select, textarea, form, [contenteditable], [role="button"], [role="combobox"], [role="listbox"], [role="option"], [role="switch"], [role="checkbox"], [role="tab"]';

// The guided setup, opened on install: one thing per step, with Back and
// Next (Skip while a step isn't done) and dots for where it stands.
export function SetupWizard() {
  const t = useMessages();
  const s = t.setup;
  const { progress, goTo, setProviderId } = useSetupProgress();
  const hasChatModel = useConfiguredModels().length > 0;
  const heading = useRef<HTMLHeadingElement>(null);
  const openSidePanel = useOpenSidePanel();
  const step = progress?.step;
  const forward = step && setupForwardAction(step, hasChatModel);
  const goForward = () => {
    const next = step && nextSetupStep(step);
    if (next) goTo(next);
  };
  const latestForward = useLatest(forward ? goForward : undefined);

  // Each step starts at its heading, for keyboards and screen readers.
  // Reaching the last step finishes setup: the side panel opens from now on.
  useEffect(() => {
    heading.current?.focus();
    if (step === "done") storage.setupDone.set(true).catch(console.warn);
  }, [step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof Element && event.target.closest(OWN_ENTER))
      )
        return;
      const next = latestForward.current;
      if (!next) return;
      event.preventDefault();
      next();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [latestForward]);

  if (!step || !progress) return null;
  const { icon: Icon, text } = STEPS[step];
  const { title, description } = text(t);
  const back = previousSetupStep(step);
  const bodies: Record<SetupStep, ReactNode> = {
    language: (
      <>
        <UiLanguageSection />
        <TranslateIntoSection />
      </>
    ),
    provider: (
      <SetupProviderStep
        providerId={progress.providerId}
        onProviderId={setProviderId}
      />
    ),
    pages: <SetupPagesStep />,
    done: (
      <SetupDoneStep
        hasChatModel={hasChatModel}
        canOpenPanel={!!openSidePanel}
        onAddProvider={() => goTo("provider")}
      />
    ),
  };

  return (
    <main className="setup-wizard" data-step={step}>
      <ScrollArea className="setup-wizard-scroll" inset>
        <section key={step} className="setup-step" aria-labelledby="setup-step">
          <header className="setup-step-header">
            {!previousSetupStep(step) && (
              <span className="setup-wizard-brand">{s.welcomeTitle}</span>
            )}
            <Icon className="setup-step-icon" aria-hidden />
            <h1 id="setup-step" ref={heading} tabIndex={-1}>
              {title}
            </h1>
            <p className="muted">{description}</p>
          </header>
          <div className="setup-step-body">{bodies[step]}</div>
        </section>
      </ScrollArea>
      <footer className="setup-wizard-actions">
        <div className="setup-wizard-action">
          {back && (
            <Button variant="ghost" onClick={() => goTo(back)}>
              <ArrowLeft size={16} className="setup-direction-icon" />
              {s.back}
            </Button>
          )}
        </div>
        <StepDots
          steps={SETUP_STEPS}
          current={setupStepIndex(step)}
          label={s.progressLabel}
          stepLabel={(index) =>
            s.progressStep
              .replace("{current}", String(index + 1))
              .replace("{total}", String(SETUP_STEPS.length))
              .replace("{step}", s.steps[SETUP_STEPS[index]])
          }
        />
        <div className="setup-wizard-action setup-forward-slot">
          {forward && (
            <Button
              className="setup-forward"
              variant={forward === "next" ? "default" : "outline"}
              onClick={goForward}
            >
              {forward === "next" ? s.next : s.skipStep}
              <ArrowRight size={16} className="setup-direction-icon" />
            </Button>
          )}
          {step === "done" && openSidePanel && (
            <Button onClick={openSidePanel}>
              <PanelRight size={16} /> {s.openPanel}
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}
