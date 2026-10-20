import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { saveRecording } from "../src/background/teach/save";
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
import { fakeTabs, installChrome } from "./fake-chrome";

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

beforeEach(() => {
  installChrome({ tabs: fakeTabs([{ id: 7, url: page.url }]).api });
});

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
