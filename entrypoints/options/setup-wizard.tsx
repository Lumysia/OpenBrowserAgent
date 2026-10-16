import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, PanelRight } from "lucide-react";
import { leaveSetup } from "../../src/shared/setup-progress";
import {
  chooseSetupPath,
  nextSetupStep,
  previousSetupStep,
  setupAsNewUser,
  setupForwardAction,
  setupSteps,
  type SetupFacts,
  type SetupStep,
} from "../../src/shared/setup-steps";
import { storage } from "../../src/shared/storage";
import { NO_SYNC_BACKEND_ID } from "../../src/shared/sync-backends";
import { Button, ScrollArea, StepDots } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { useLatest } from "../../src/ui/use-latest";
import { useStoredState } from "../../src/ui/useStoredState";
import { useConfiguredModels } from "./model-select";
import { SetupDoneStep } from "./setup-done-step";
import { SetupDownloadStep } from "./setup-download-step";
import { SetupPagesStep } from "./setup-pages-step";
import { SetupPassphraseStep } from "./setup-passphrase-step";
import { SetupPathStep } from "./setup-path-step";
import { SetupProviderStep } from "./setup-provider-step";
import { SETUP_STEP_HEADINGS } from "./setup-step-headings";
import { SetupSyncStep } from "./setup-sync-step";
import { TranslateIntoSection } from "./translate-into";
import { UiLanguageSection } from "./ui-language-section";
import { useOpenSidePanel } from "./use-open-side-panel";
import { useSetupProgress } from "./use-setup-progress";

// Where Enter belongs to the control (a button, a field, a list) instead
// of meaning "Next".
const OWN_ENTER =
  'a, button, input, select, textarea, form, [contenteditable], [role="button"], [role="combobox"], [role="listbox"], [role="option"], [role="switch"], [role="checkbox"], [role="tab"]';

// The guided setup, opened on install: one thing per step, with Back and
// Next (Skip while a step isn't done) and dots for where it stands on the
// path chosen.
export function SetupWizard() {
  const t = useMessages();
  const s = t.setup;
  const { progress, goTo, goToPath, setProviderId } = useSetupProgress();
  const hasChatModel = useConfiguredModels().length > 0;
  const [syncStatus] = useStoredState(storage.syncStatus);
  const [activeSyncBackendId] = useStoredState(storage.activeSyncBackendId);
  const heading = useRef<HTMLHeadingElement>(null);
  const openSidePanel = useOpenSidePanel();
  const facts: SetupFacts = {
    hasChatModel,
    syncOn: !!activeSyncBackendId && activeSyncBackendId !== NO_SYNC_BACKEND_ID,
    keys: syncStatus?.keys,
  };
  const step = progress?.step;
  const forward = progress && setupForwardAction(progress, facts);
  const goForward = () => {
    const next = progress && nextSetupStep(progress, facts);
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

  if (!step || !progress || !syncStatus || !activeSyncBackendId) return null;
  const { icon: Icon, ...heads } = SETUP_STEP_HEADINGS[step];
  const steps = setupSteps(progress, facts);
  const back = previousSetupStep(progress, facts);
  const asNewUser = () => goToPath(setupAsNewUser());
  // Connected: on to the passphrase if the synced keys have one, as the
  // sync round just stored.
  const synced = async () => {
    const { keys } = await storage.syncStatus.get();
    const next = nextSetupStep({ step: "sync", path: "returning" }, { keys });
    if (next) goTo(next);
  };
  const bodies: Record<SetupStep, ReactNode> = {
    language: (
      <>
        <UiLanguageSection />
        <TranslateIntoSection />
      </>
    ),
    path: (
      <SetupPathStep
        path={progress.path}
        onChoose={(path) => goToPath(chooseSetupPath(path, facts))}
      />
    ),
    provider: (
      <SetupProviderStep
        providerId={progress.providerId}
        onProviderId={setProviderId}
      />
    ),
    pages: <SetupPagesStep />,
    sync: (
      <SetupSyncStep
        onConnected={() => void synced().catch(console.warn)}
        onNewUser={asNewUser}
      />
    ),
    passphrase: (
      <SetupPassphraseStep
        unlocked={!!facts.keys?.unlocked}
        onUnlocked={goForward}
      />
    ),
    download: <SetupDownloadStep onNewUser={asNewUser} />,
    done: (
      <SetupDoneStep
        hasChatModel={hasChatModel}
        canOpenPanel={!!openSidePanel}
        onAddProvider={asNewUser}
      />
    ),
  };

  return (
    <main className="setup-wizard" data-step={step}>
      <ScrollArea className="setup-wizard-scroll" inset>
        <section key={step} className="setup-step" aria-labelledby="setup-step">
          <header className="setup-step-header">
            {!back && (
              <span className="setup-wizard-brand">{s.welcomeTitle}</span>
            )}
            <Icon className="setup-step-icon" aria-hidden />
            <h1 id="setup-step" ref={heading} tabIndex={-1}>
              {s[heads.title]}
            </h1>
            <p className="muted">{s[heads.description]}</p>
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
          steps={steps}
          current={steps.indexOf(step)}
          label={s.progressLabel}
          stepLabel={(index) =>
            s.progressStep
              .replace("{current}", String(index + 1))
              .replace("{total}", String(steps.length))
              .replace("{step}", s.steps[steps[index]])
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
            <Button
              onClick={() =>
                openSidePanel()
                  .then(() => leaveSetup(progress.returnTo))
                  .catch(console.warn)
              }
            >
              <PanelRight size={16} /> {s.openPanel}
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}
