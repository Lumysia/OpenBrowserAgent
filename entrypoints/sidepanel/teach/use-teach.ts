import { useCallback, useEffect, useMemo, useState } from "react";
import { getActiveTab, isScriptableUrl } from "../../../src/shared/browser";
import { getBrowserApi } from "../../../src/shared/browser-api";
import { setSkillInvokeMode } from "../../../src/shared/skill-catalog";
import { storage } from "../../../src/shared/storage";
import { STORAGE_KEYS } from "../../../src/shared/storage-keys";
import { sessionRecord } from "../../../src/shared/session-record";
import { skillCheckInstruction } from "../../../src/shared/teach/check";
import {
  sendTeachMessage,
  TEACH_MESSAGE,
  type TeachSaved,
} from "../../../src/shared/teach/messages";
import {
  skillChecks,
  teachSessions,
  type SkillCheckResult,
} from "../../../src/shared/teach/records";
import type { TeachSession } from "../../../src/shared/teach/types";
import { formatMessage } from "../../../src/shared/text";
import { userErrorText } from "../../../src/shared/user-errors";
import type { AttachmentTab, PickedSkill } from "../../../src/shared/types";
import { useMessages, useUiLanguage } from "../../../src/ui/messages";
import type { SendRequest } from "../send-message-plan";
import { toAttachmentTab } from "../sidepanel-context";

// Teach mode in the side panel: the start form, the recording (newest
// first: normally there is one), its draft, and the check run of the saved
// skill with what comes after it. The background keeps the recordings
// (storage.session); this hook watches them and sends the user's choices.

type TeachSend = SendRequest & { content: string };

// The tab a check run worked in (run-tab.ts keeps the last one per chat).
const runTabs = sessionRecord<Record<string, number>>(
  STORAGE_KEYS.runTabs,
  () => ({}),
);

const SKILL_CREATOR = "skill-creator";

export type TeachStartTarget = { tabId: number; scriptable: boolean };

export function useTeach({
  send,
  createChat,
  currentChatId,
  canSend,
  confirmConsent,
  skills,
}: {
  send: (request: TeachSend) => void;
  createChat: () => { id: string };
  currentChatId: string | undefined;
  canSend: boolean;
  confirmConsent: (newChat: boolean) => Promise<boolean>;
  skills: PickedSkill[];
}) {
  const t = useMessages();
  const language = useUiLanguage() ?? "";
  const [sessions, setSessions] = useState<Record<string, TeachSession>>({});
  const [checks, setChecks] = useState<Record<string, SkillCheckResult>>({});
  const [starting, setStarting] = useState<TeachStartTarget>();
  const [pending, setPending] = useState<TeachSend & { chatId: string }>();
  const [error, setError] = useState("");
  // Check results whose steps the agent was asked to fix: the card offers
  // to check again.
  const [fixing, setFixing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void teachSessions.get().then(setSessions);
    void skillChecks.get().then(setChecks);
    const stopSessions = teachSessions.watch(setSessions);
    const stopChecks = skillChecks.watch(setChecks);
    return () => {
      stopSessions();
      stopChecks();
    };
  }, []);

  // A check run starts once its new chat is open.
  useEffect(() => {
    if (!pending || pending.chatId !== currentChatId || !canSend) return;
    setPending(undefined);
    const { chatId: _chatId, ...request } = pending;
    send(request);
  }, [canSend, currentChatId, pending, send]);

  const session = useMemo(
    () => Object.values(sessions).sort((a, b) => b.startedAt - a.startedAt)[0],
    [sessions],
  );
  const check = currentChatId ? checks[currentChatId] : undefined;

  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      setError("");
      try {
        await work();
      } catch (failure) {
        setError(userErrorText(failure, t));
      }
    },
    [t],
  );

  const openStart = useCallback(async () => {
    const tab = await getActiveTab();
    if (tab?.id === undefined) return;
    setError("");
    setStarting({ tabId: tab.id, scriptable: isScriptableUrl(tab.url) });
  }, []);

  const start = (
    target: TeachStartTarget,
    notes: { purpose: string; varies: string },
  ) =>
    run(async () => {
      await sendTeachMessage({
        type: TEACH_MESSAGE.start,
        tabId: target.tabId,
        ...notes,
      });
      setStarting(undefined);
    });

  const startCheck = (skillId: string, name: string) =>
    run(async () => {
      const opened = await sendTeachMessage<{
        tabId: number;
        title: string;
        url: string;
      }>({ type: TEACH_MESSAGE.openCheckTab, skillId });
      const tab = await getBrowserApi().tabs.get(opened.tabId);
      const attached = toAttachmentTab(tab);
      const picked = skills.find((skill) => skill.id === skillId) || {
        id: skillId,
        name,
        description: "",
      };
      setPending({
        chatId: createChat().id,
        content: formatMessage(t.teach.check.message, { name }),
        instruction: skillCheckInstruction({
          name,
          tabId: opened.tabId,
          replyLanguage: language,
        }),
        tabs: attached ? [attached] : ([] as AttachmentTab[]),
        skills: [picked],
        skillCheck: { skillId },
      });
    });

  const save = (
    tabId: number,
    draft: { name: string; description: string },
    check: boolean,
  ) =>
    run(async () => {
      const saved = await sendTeachMessage<TeachSaved>({
        type: TEACH_MESSAGE.save,
        tabId,
        ...draft,
      });
      if (check) await startCheck(saved.skillId, saved.name);
    });

  const dismissCheck = (chatId: string) =>
    run(() =>
      skillChecks.update((current) => {
        const next = { ...current };
        delete next[chatId];
        return next;
      }),
    );

  const allowAutomatic = (skillId: string) =>
    run(() =>
      storage.skillSettings.update((current) =>
        setSkillInvokeMode(current, skillId, "auto"),
      ),
    );

  const fixSteps = (chatId: string, result: SkillCheckResult, name: string) => {
    const creator = skills.find((skill) => skill.name === SKILL_CREATOR);
    const skill = skills.find((item) => item.id === result.skillId);
    setFixing((current) => ({ ...current, [chatId]: true }));
    send({
      content: formatMessage(t.teach.check.fixMessage, { name }),
      instruction: `The check run of the recorded skill "${name}" above went differently${result.divergedAt ? ` at step ${result.divergedAt}` : ""}: ${result.summary} Fix the skill's steps from what worked in this run, as the skill-creator skill says for a recorded skill (skills tool, patch). Keep its frontmatter. Then tell the user briefly what changed and that it is still a draft until it is checked again.`,
      tabs: [],
      skills: [creator, skill].filter((item): item is PickedSkill => !!item),
    });
  };

  const recordAgain = (chatId: string, result: SkillCheckResult) =>
    run(async () => {
      const tabId = (await runTabs.get())[chatId] ?? (await getActiveTab())?.id;
      if (tabId === undefined) return;
      await sendTeachMessage({
        type: TEACH_MESSAGE.start,
        tabId,
        redo: { skillId: result.skillId, fromStep: result.divergedAt || 1 },
      });
      await dismissCheck(chatId);
    });

  const stop = (tabId: number) =>
    run(async () => {
      // Writing the skill sends the steps to the chat model.
      if (!(await confirmConsent(false))) return;
      await sendTeachMessage({ type: TEACH_MESSAGE.stop, tabId });
    });

  const message = (value: Parameters<typeof sendTeachMessage>[0]) =>
    run(() => sendTeachMessage(value));

  // Whether the example is as asked: false when the page no longer has the
  // value.
  const keepExample = async (tabId: number, stepId: string, keep: boolean) => {
    let done = true;
    await run(async () => {
      done = await sendTeachMessage<boolean>({
        type: TEACH_MESSAGE.keepExample,
        tabId,
        stepId,
        keep,
      });
    });
    return done;
  };

  return {
    session,
    starting,
    error,
    check:
      check && currentChatId ? { chatId: currentChatId, ...check } : undefined,
    fixing: currentChatId ? !!fixing[currentChatId] : false,
    openStart,
    cancelStart: () => setStarting(undefined),
    start,
    stop,
    message,
    keepExample,
    save,
    startCheck,
    dismissCheck,
    allowAutomatic,
    fixSteps,
    recordAgain,
  };
}

export type TeachController = ReturnType<typeof useTeach>;
