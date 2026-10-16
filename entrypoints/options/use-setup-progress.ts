import { useEffect, useRef, useState } from "react";
import {
  releaseSetupProvider,
  setupProgress,
} from "../../src/shared/setup-progress";
import {
  resumeSetupProgress,
  setupHoldsProvider,
  type SetupProgress,
  type SetupStep,
} from "../../src/shared/setup-steps";

// Where the guided setup stands: as stored for this session (undefined
// while it loads), followed when another page changes it ("Run setup
// again").
export function useSetupProgress() {
  const [progress, setProgress] = useState<SetupProgress>();
  // The latest, for changes made one after another before a render.
  const latest = useRef<SetupProgress>(undefined);
  latest.current = progress;

  useEffect(() => {
    let active = true;
    const stop = setupProgress.watch((stored) => {
      if (active) setProgress(resumeSetupProgress(stored));
    });
    void setupProgress.get().then((stored) => {
      if (active)
        setProgress((current) => current ?? resumeSetupProgress(stored));
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  function save(change: Partial<SetupProgress>) {
    const next = { ...resumeSetupProgress(latest.current), ...change };
    latest.current = next;
    setProgress(next);
    setupProgress.set(next).catch(console.warn);
  }

  // Off the AI provider step, the provider setup added there goes if the
  // user filled in nothing, and setup forgets it once it no longer holds
  // it (see setupHoldsProvider).
  const step = progress?.step;
  const path = progress?.path;
  const providerId = progress?.providerId;
  useEffect(() => {
    if (!step || !providerId || step === "provider") return;
    void releaseSetupProvider(providerId)
      .then((gone) => {
        // As setup stands once the provider is checked.
        const now = latest.current;
        if (now?.providerId !== providerId) return;
        if (gone || (now.step !== "provider" && !setupHoldsProvider(now)))
          save({ providerId: undefined });
      })
      .catch(console.warn);
  }, [step, path, providerId]);

  return {
    progress,
    goTo: (step: SetupStep) => save({ step }),
    // A step on another path too (the path question answered, or sync
    // that didn't work out).
    goToPath: (change: Pick<SetupProgress, "step" | "path">) => save(change),
    setProviderId: (providerId: string | undefined) => save({ providerId }),
  };
}
