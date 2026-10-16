import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseSetupPath,
  FIRST_SETUP_STEP,
  nextSetupStep,
  previousSetupStep,
  resumeSetupProgress,
  SETUP_PATH_STEPS,
  setupAsNewUser,
  setupForwardAction,
  setupNeedsProviderNote,
  setupStepDone,
  setupSteps,
  type SetupFacts,
  type SetupPath,
  type SetupStep,
} from "../src/shared/setup-steps";
import {
  syncBroughtNoProvider,
  syncedDataCounts,
} from "../src/shared/setup-summary";
import { BUILTIN_AGENTS } from "../src/shared/agents";
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

const NONE: SetupFacts = { hasChatModel: false, syncOn: false };
const SEALED = { onServer: true, unlocked: false };

// Walks forward from the first step on `path`, as Next / Skip would.
function walk(path: SetupPath | undefined, facts: SetupFacts = NONE) {
  const steps: SetupStep[] = [FIRST_SETUP_STEP];
  for (;;) {
    const next = nextSetupStep({ step: steps.at(-1)!, path }, facts);
    if (!next) return steps;
    steps.push(next);
  }
}

test("a first-time user goes language, the question, AI provider, on web pages, done", () => {
  assert.equal(FIRST_SETUP_STEP, "language");
  assert.deepEqual(walk("new"), [
    "language",
    "path",
    "provider",
    "pages",
    "done",
  ]);
  // Unanswered, the question leads on the first-time path.
  assert.deepEqual(walk(undefined), walk("new"));
  assert.deepEqual(setupSteps({ step: "language" }, NONE), walk("new"));
  assert.equal(previousSetupStep({ step: "language" }, NONE), undefined);
  for (const [index, step] of SETUP_PATH_STEPS.new.entries())
    if (index)
      assert.equal(
        previousSetupStep({ step, path: "new" }, NONE),
        SETUP_PATH_STEPS.new[index - 1],
      );
});

test("a returning user syncs instead: the AI provider and page steps are skipped", () => {
  // The passphrase step only when the synced keys are sealed with one.
  assert.deepEqual(walk("returning"), [
    "language",
    "path",
    "sync",
    "download",
    "done",
  ]);
  const sealed = { ...NONE, syncOn: true, keys: SEALED };
  assert.deepEqual(walk("returning", sealed), [
    "language",
    "path",
    "sync",
    "passphrase",
    "download",
    "done",
  ]);
  // Still there once they are unlocked, and while setup is at it.
  assert.deepEqual(
    setupSteps(
      { step: "download", path: "returning" },
      { keys: { onServer: true, unlocked: true } },
    ),
    SETUP_PATH_STEPS.returning,
  );
  assert.deepEqual(
    setupSteps({ step: "passphrase", path: "returning" }, NONE),
    SETUP_PATH_STEPS.returning,
  );
  // Back across the branch: from the first returning step to the question.
  assert.equal(
    previousSetupStep({ step: "sync", path: "returning" }, NONE),
    "path",
  );
  assert.equal(
    previousSetupStep({ step: "download", path: "returning" }, sealed),
    "passphrase",
  );
  for (const step of ["provider", "pages"] as const)
    assert.equal(walk("returning", sealed).includes(step), false);
});

test("answering the question goes on to that path; sync that fails goes on as a new user", () => {
  assert.deepEqual(chooseSetupPath("new", {}), {
    path: "new",
    step: "provider",
  });
  assert.deepEqual(chooseSetupPath("returning", {}), {
    path: "returning",
    step: "sync",
  });
  assert.deepEqual(setupAsNewUser(), { path: "new", step: "provider" });
});

test("every step but sync can be skipped: Skip until the step is done", () => {
  const forward = (
    step: SetupStep,
    facts: Partial<SetupFacts> = {},
    path?: SetupPath,
  ) => setupForwardAction({ step, path }, { ...NONE, ...facts });
  assert.equal(forward("language"), "next");
  assert.equal(forward("path"), "skip");
  assert.equal(forward("path", {}, "returning"), "next");
  assert.equal(forward("provider"), "skip");
  // A model that came through sync counts the same as one added here.
  assert.equal(forward("provider", { hasChatModel: true }), "next");
  assert.equal(forward("pages"), "next");
  assert.equal(forward("done"), undefined);
  // Sync goes on with its own Connect.
  assert.equal(forward("sync", {}, "returning"), undefined);
  assert.equal(forward("sync", { syncOn: true }, "returning"), "next");
  assert.equal(forward("passphrase", { keys: SEALED }, "returning"), "skip");
  assert.equal(
    forward(
      "passphrase",
      { keys: { onServer: true, unlocked: true } },
      "returning",
    ),
    "next",
  );
  assert.equal(forward("download", {}, "returning"), "next");
  assert.equal(setupStepDone({ step: "pages" }, NONE), true);
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
  // The path chosen is remembered; a step not on it starts over.
  assert.deepEqual(resumeSetupProgress({ step: "sync", path: "returning" }), {
    step: "sync",
    path: "returning",
  });
  assert.deepEqual(resumeSetupProgress({ step: "sync" }), { step: "language" });
  assert.deepEqual(resumeSetupProgress({ step: "pages", path: "returning" }), {
    step: "language",
    path: "returning",
  });
  assert.deepEqual(resumeSetupProgress({ step: "pages", path: "other" }), {
    step: "pages",
  });
  // Run again from a settings tab: setup goes back there when done.
  const returnTo = { tabId: 4, hash: "#/" };
  assert.deepEqual(resumeSetupProgress({ step: "done", returnTo }), {
    step: "done",
    returnTo,
  });
  assert.deepEqual(
    resumeSetupProgress({ step: "done", returnTo: { tabId: "4", hash: "/" } }),
    { step: "done" },
  );
});

test("what sync brought: counts of the kinds there are, built-in agents left out", () => {
  const agent = (id: string) => ({ ...BUILTIN_AGENTS[0], id });
  const data = {
    providers: {
      a: { type: "openai" as const, models: [] },
      b: { type: "openai" as const, models: [] },
    },
    agents: [...BUILTIN_AGENTS, agent("mine"), agent("another")],
    skills: [],
    chats: [{ id: "c" }] as never,
  };
  assert.deepEqual(syncedDataCounts(data), [
    { kind: "providers", count: 2 },
    { kind: "agents", count: 2 },
    { kind: "chats", count: 1 },
  ]);
  assert.equal(syncBroughtNoProvider(data), false);
  // Nothing came: no AI provider, and no kinds to list.
  assert.deepEqual(syncedDataCounts({ agents: [...BUILTIN_AGENTS] }), []);
  assert.equal(syncBroughtNoProvider({ providers: {} }), true);
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
