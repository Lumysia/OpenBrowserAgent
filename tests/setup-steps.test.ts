import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_SETUP_STEP,
  nextSetupStep,
  previousSetupStep,
  resumeSetupProgress,
  SETUP_STEPS,
  setupForwardAction,
  setupNeedsProviderNote,
  setupStepDone,
} from "../src/shared/setup-steps";
import { isSetupFinished } from "../src/shared/setup-gate";
import { storage } from "../src/shared/storage";
import { runStorageMigrations } from "../src/shared/storage-migrations";
import { eventListeners, memoryArea, swapChrome } from "./fake-chrome";
import {
  DEFAULT_SMART_BAR_SETTINGS,
  SMART_BAR_TRIGGER,
  smartBarOnSelection,
  withSmartBarOnSelection,
} from "../src/shared/smart-bar";

test("setup goes language, AI provider, on web pages, done; Back and Next walk it", () => {
  assert.deepEqual(SETUP_STEPS, ["language", "provider", "pages", "done"]);
  assert.equal(FIRST_SETUP_STEP, "language");
  assert.equal(previousSetupStep("language"), undefined);
  assert.equal(nextSetupStep("done"), undefined);
  for (const [index, step] of SETUP_STEPS.entries()) {
    assert.equal(nextSetupStep(step), SETUP_STEPS[index + 1]);
    if (index) assert.equal(previousSetupStep(step), SETUP_STEPS[index - 1]);
  }
});

test("every step can be skipped: the AI provider step says Skip until a model exists", () => {
  assert.equal(setupForwardAction("language", false), "next");
  assert.equal(setupForwardAction("provider", false), "skip");
  assert.equal(setupForwardAction("provider", true), "next");
  assert.equal(setupForwardAction("pages", false), "next");
  assert.equal(setupForwardAction("done", false), undefined);
  // A model that came through sync counts the same as one added here.
  assert.equal(setupStepDone("provider", true), true);
  assert.equal(setupStepDone("provider", false), false);
  assert.equal(setupStepDone("pages", false), true);
});

test("Done says chat needs an AI provider only while there is no model", () => {
  assert.equal(setupNeedsProviderNote("done", false), true);
  assert.equal(setupNeedsProviderNote("done", true), false);
  assert.equal(setupNeedsProviderNote("pages", false), false);
});

test("setup resumes where this session left it, and starts over from anything else", () => {
  assert.deepEqual(resumeSetupProgress(undefined), { step: "language" });
  assert.deepEqual(resumeSetupProgress({ step: "pages" }), { step: "pages" });
  assert.deepEqual(resumeSetupProgress({ step: "provider", providerId: "p" }), {
    step: "provider",
    providerId: "p",
  });
  assert.deepEqual(resumeSetupProgress({ step: "unknown", providerId: "" }), {
    step: "language",
  });
  assert.deepEqual(resumeSetupProgress("pages"), { step: "language" });
});

test("setup's smart bar switch: on opens it on a selection, off turns it off", () => {
  assert.equal(smartBarOnSelection(DEFAULT_SMART_BAR_SETTINGS), false);
  const on = withSmartBarOnSelection(
    { ...DEFAULT_SMART_BAR_SETTINGS, trigger: SMART_BAR_TRIGGER.shortcut },
    true,
  );
  assert.equal(on.enabled, true);
  assert.equal(on.trigger, SMART_BAR_TRIGGER.selection);
  assert.equal(smartBarOnSelection(on), true);
  const off = withSmartBarOnSelection(on, false);
  assert.equal(off.enabled, false);
  assert.equal(smartBarOnSelection(off), false);
  // Shortcut-only is not "on selected text".
  assert.equal(
    smartBarOnSelection({ ...on, trigger: SMART_BAR_TRIGGER.shortcut }),
    false,
  );
});

test("setup is finished once its last step was reached or a model is there", () => {
  const withModel = {
    p: { type: "openai" as const, models: [{ id: "p:m", name: "m" }] },
  };
  const withoutModel = { p: { type: "openai" as const, models: [] } };
  assert.equal(isSetupFinished(false, {}), false);
  // A provider setup added but no model yet: still setting up.
  assert.equal(isSetupFinished(false, withoutModel), false);
  assert.equal(isSetupFinished(true, {}), true);
  // A model that came through sync.
  assert.equal(isSetupFinished(false, withModel), true);
});

test("an update counts setup as done; a new install starts without it", async () => {
  const restore = swapChrome({
    storage: { local: memoryArea(), onChanged: eventListeners() },
  });
  try {
    await runStorageMigrations(true);
    assert.equal(await storage.setupDone.get(), false);
    // Recorded as done on the new install: a later update leaves it.
    await runStorageMigrations(false);
    assert.equal(await storage.setupDone.get(), false);
  } finally {
    restore();
  }
  const restoreUpdate = swapChrome({
    storage: { local: memoryArea(), onChanged: eventListeners() },
  });
  try {
    await runStorageMigrations(false);
    assert.equal(await storage.setupDone.get(), true);
  } finally {
    restoreUpdate();
  }
});
