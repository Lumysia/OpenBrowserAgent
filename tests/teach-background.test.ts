import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { saveRecording } from "../src/background/teach/save";
import { writeDraft } from "../src/background/teach/writer";
import { getMessages } from "../src/shared/i18n";
import { failureError } from "../src/shared/runtime-messages";
import { userErrorText } from "../src/shared/user-errors";
import {
  resolveSkillCatalog,
  setSkillInvokeMode,
} from "../src/shared/skill-catalog";
import { storage } from "../src/shared/storage";
import { teachSessions } from "../src/shared/teach/records";
import {
  buildRecordedSkill,
  withRecordedStatus,
} from "../src/shared/teach/skill-files";
import type { TeachSession } from "../src/shared/teach/types";
import { setupTeach } from "../src/background/teach";
import { startRecording } from "../src/background/teach/recorder";
import { createRunTab, whileWorking } from "../src/background/run-tab";
import { tabsTool } from "../src/background/tools/tabs";
import type { ToolContext } from "../src/background/tools/types";
import { eventListeners, fakeTabs, installChrome } from "./fake-chrome";

const page = { title: "Form", url: "https://app.test/form" };

function session(partial: Partial<TeachSession> = {}): TeachSession {
  return {
    id: "s1",
    tabId: 7,
    tabIds: [7],
    startedAt: 1,
    lastEventAt: 1,
    startUrl: page.url,
    purpose: "",
    varies: "",
    steps: [{ id: "a", kind: "click", at: 1, page }],
    state: "review",
    dropped: 0,
    draft: { name: "submit-form", description: "Submits.", body: "## Steps" },
    ...partial,
  };
}

// A chrome with the tab, scripting and events the recorder uses; `emit`
// fires a browser event.
function installBrowser() {
  const events = {
    onRemoved: eventListeners<(tabId: number) => void>(),
    onCreated: eventListeners(),
    onActivated: eventListeners(),
    onCommitted: eventListeners(),
    onHistoryStateUpdated: eventListeners(),
    onDOMContentLoaded: eventListeners(),
    onAlarm: eventListeners<(alarm: { name: string }) => void>(),
  };
  const tabs = fakeTabs([
    { id: 7, url: page.url },
    { id: 8, url: "https://app.test/other" },
    { id: 9, url: "https://app.test/busy" },
  ]).api;
  installChrome({
    tabs: {
      ...tabs,
      onRemoved: events.onRemoved,
      onCreated: events.onCreated,
      onActivated: events.onActivated,
      sendMessage: async () => undefined,
      group: async () => 1,
      ungroup: async () => undefined,
    },
    tabGroups: { update: async () => undefined },
    scripting: { executeScript: async () => [{ result: true }] },
    webNavigation: {
      onCommitted: events.onCommitted,
      onHistoryStateUpdated: events.onHistoryStateUpdated,
      onDOMContentLoaded: events.onDOMContentLoaded,
    },
    alarms: {
      create: async () => undefined,
      clear: async () => true,
      onAlarm: events.onAlarm,
    },
    runtime: { getURL: (path: string) => `chrome-extension://x/${path}` },
  });
  return events;
}

let events: ReturnType<typeof installBrowser>;
beforeEach(() => {
  events = installBrowser();
});

// Until the background is done with what an event started.
const settled = (check: () => Promise<boolean>) =>
  (async () => {
    for (let tries = 0; tries < 100; tries++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("timed out");
  })();

test("a redone skill is saved as a draft that is used only when picked", async () => {
  const earlier = withRecordedStatus(
    buildRecordedSkill({
      session: session(),
      draft: { name: "submit-form", description: "Submits.", body: "Old" },
      existingNames: [],
    }),
    "verified",
  );
  await storage.skills.replace([earlier]);
  await storage.skillSettings.replace(
    setSkillInvokeMode({}, earlier.id, "auto"),
  );
  await teachSessions.set({
    7: session({ redo: { skillId: earlier.id, fromStep: 1 } }),
  });
  await saveRecording({ tabId: 7, name: "submit-form", description: "x" });
  const [entry] = resolveSkillCatalog(
    await storage.skills.get(),
    await storage.skillSettings.get(),
  ).filter((item) => item.skill.id === earlier.id);
  assert.equal(entry.invoke, "manual");
});

test("teach errors reach the side panel as codes it shows in the UI language", async () => {
  await teachSessions.set({ 7: session({ state: "writing", steps: [] }) });
  await writeDraft(7);
  const failed = (await teachSessions.get())[7];
  assert.equal(failed.state, "failed");
  assert.equal(failed.failure?.code, "teachEmpty");
  for (const language of ["de-DE", "zh-TW"] as const)
    assert.equal(
      userErrorText(failureError(failed.failure!), getMessages(language)),
      getMessages(language).display.errors.teachEmpty,
    );
  await teachSessions.set({});
  await assert.rejects(
    saveRecording({ tabId: 7, name: "x", description: "" }),
    (error: { code?: string }) => error.code === "teachGone",
  );
});

test("one recording at a time", async () => {
  await startRecording({ tabId: 7 });
  // The same tab again is the same recording.
  assert.equal((await startRecording({ tabId: 7 })).tabId, 7);
  await assert.rejects(
    startRecording({ tabId: 8 }),
    (error: { code?: string }) => error.code === "teachBusy",
  );
  // An ended recording waiting for the user blocks a new one too.
  await teachSessions.update((sessions) => ({
    7: { ...sessions[7], state: "ended", endedBy: "idle" },
  }));
  await assert.rejects(
    startRecording({ tabId: 8 }),
    (error: { code?: string }) => error.code === "teachBusy",
  );
});

test("a recording does not start in a tab the agent works in", async () => {
  const tab = createRunTab("chat", { id: 9, title: "Busy" });
  tab.use({ id: 9, title: "Busy" });
  let release = () => {};
  const running = whileWorking(
    tab,
    () => new Promise<void>((resolve) => (release = resolve)),
  );
  await assert.rejects(
    startRecording({ tabId: 9 }),
    (error: { code?: string }) => error.code === "teachTabBusy",
  );
  release();
  await running;
  assert.equal((await startRecording({ tabId: 9 })).tabId, 9);
});

test("the agent cannot close or group a tab being recorded", async () => {
  await startRecording({ tabId: 7 });
  const context = {
    run: { tab: createRunTab("chat"), chatId: "chat" },
  } as unknown as ToolContext;
  for (const input of [
    { action: "close", tabIds: [8, 7] },
    { action: "close", tabId: 7 },
    { action: "group", tabIds: [7] },
  ])
    await assert.rejects(
      tabsTool.execute(input, context),
      (error: { code?: string }) => error.code === "tabRecording",
      JSON.stringify(input),
    );
  assert.ok(await chrome.tabs.get(7));
  assert.ok(await chrome.tabs.get(8));
});

test("a recording whose tab closes or goes idle waits for the user", async () => {
  setupTeach();
  await startRecording({ tabId: 7 });
  await teachSessions.update((sessions) => ({
    7: { ...sessions[7], steps: session().steps },
  }));
  events.onRemoved.emit(7);
  await settled(
    async () => (await teachSessions.get())[7]?.state !== "recording",
  );
  // Not written (no model is set up: writing would have failed).
  assert.equal((await teachSessions.get())[7].state, "ended");
  assert.equal((await teachSessions.get())[7].endedBy, "tabClosed");

  await teachSessions.set({});
  await startRecording({ tabId: 8 });
  await teachSessions.update((sessions) => ({
    8: { ...sessions[8], lastEventAt: 0 },
  }));
  events.onAlarm.emit({ name: "teach-idle" });
  await settled(
    async () => (await teachSessions.get())[8]?.state !== "recording",
  );
  assert.equal((await teachSessions.get())[8].state, "ended");
  assert.equal((await teachSessions.get())[8].endedBy, "idle");
});

test("Stop on the page before the provider is allowed waits for the user", async () => {
  await storage.provider.replace({
    remote: {
      id: "remote",
      type: "openai",
      baseUrl: "https://models.example.test/v1",
      apiKey: "k",
      models: [{ id: "m", name: "m" }],
    },
  } as never);
  await storage.preferences.update((current) => ({
    ...current,
    selectedModelId: "m",
  }));
  await teachSessions.set({ 7: session({ state: "writing" }) });
  await writeDraft(7);
  const ended = (await teachSessions.get())[7];
  assert.equal(ended.state, "ended");
  assert.equal(ended.endedBy, "consent");
});
