import { getBrowserApi } from "../../shared/browser-api";
import { respondWith, type RuntimeReply } from "../../shared/runtime-messages";
import {
  isTeachMessage,
  TEACH_MESSAGE,
  TEACH_PAGE_MESSAGE,
  type TeachMessage,
} from "../../shared/teach/messages";
import { sessionOfTab, teachSessions } from "../../shared/teach/records";
import { isSecretStep } from "../../shared/teach/secret-fields";
import {
  TEACH_STATE,
  TEACH_STEP_KIND,
  type TeachSession,
} from "../../shared/teach/types";
import {
  discardRecording,
  finishRecording,
  recordEvent,
  setupTeachRecorder,
  startRecording,
  updateSession,
  whenRecordingStops,
} from "./recorder";
import type { ExampleReply } from "../../shared/teach/page-protocol";
import { openCheckTab, redoSteps, saveRecording } from "./save";
import { writeDraft } from "./writer";

// Teach mode in the background: the recordings (recorder.ts), their drafts
// (writer.ts) and saving them as skills (save.ts), driven by the side panel
// and the recording page.

// Longest example value kept.
const EXAMPLE_CHARS = 200;

type Sender = chrome.runtime.MessageSender;

export function setupTeach() {
  setupTeachRecorder();
  whenRecordingStops(async (tabId) => {
    void writeDraft(tabId).catch((error: unknown) =>
      console.warn("Teach mode", error),
    );
  });
}

function changeStep(
  tabId: number,
  stepId: string,
  change: (step: TeachSession["steps"][number]) => TeachSession["steps"],
) {
  return updateSession(tabId, (session) => ({
    ...session,
    steps: session.steps.flatMap((step) =>
      step.id === stepId ? change(step) : [step],
    ),
  }));
}

// The value of a field step from the page that still has it, judged
// secret or not by the page as it is now.
async function pageExample(
  session: TeachSession,
  stepId: string,
): Promise<ExampleReply> {
  for (const tabId of session.tabIds) {
    const reply = (await getBrowserApi()
      .tabs.sendMessage(
        tabId,
        { type: TEACH_PAGE_MESSAGE.example, stepId },
        { frameId: 0 },
      )
      .catch(() => undefined)) as ExampleReply | undefined;
    if (reply?.secret === true) return { secret: true };
    if (typeof reply?.value === "string") return { value: reply.value };
  }
  return {};
}

// Whether the example is as asked; false when the page no longer has the
// value or the field is secret (then the step is marked secret).
async function keepExample(tabId: number, stepId: string, keep: boolean) {
  const session = sessionOfTab(await teachSessions.get(), tabId);
  const step = session?.steps.find((item) => item.id === stepId);
  if (!session || step?.kind !== TEACH_STEP_KIND.field || !step.field)
    throw new Error("There is no such field.");
  const reply =
    keep && !isSecretStep(step) ? await pageExample(session, stepId) : {};
  const secret = isSecretStep(step) || reply.secret === true;
  const value = secret ? undefined : reply.value;
  await changeStep(tabId, stepId, (current) => [
    {
      ...current,
      field: {
        ...current.field!,
        secret: current.field!.secret || secret,
        example: value ? value.slice(0, EXAMPLE_CHARS) : undefined,
      },
    },
  ]);
  return !keep || value !== undefined;
}

async function rewrite(tabId: number) {
  await updateSession(tabId, (session) =>
    session.state === TEACH_STATE.failed
      ? { ...session, state: TEACH_STATE.writing, error: undefined }
      : session,
  );
  void writeDraft(tabId);
}

async function stop(tabId: number) {
  await finishRecording(tabId);
  return sessionOfTab(await teachSessions.get(), tabId);
}

function fromPanel(message: TeachMessage) {
  switch (message.type) {
    case TEACH_MESSAGE.start:
      return (async () =>
        startRecording(
          message,
          message.redo ? await redoSteps(message.redo) : [],
        ))();
    case TEACH_MESSAGE.stop:
      return stop(message.tabId);
    case TEACH_MESSAGE.discard:
      return discardRecording(message.tabId);
    case TEACH_MESSAGE.deleteStep:
      return changeStep(message.tabId, message.stepId, () => []);
    case TEACH_MESSAGE.markVaries:
      return changeStep(message.tabId, message.stepId, (step) => [
        { ...step, varies: message.varies },
      ]);
    case TEACH_MESSAGE.keepExample:
      return keepExample(message.tabId, message.stepId, message.keep);
    case TEACH_MESSAGE.rewrite:
      return rewrite(message.tabId);
    case TEACH_MESSAGE.save:
      return saveRecording(message);
    case TEACH_MESSAGE.openCheckTab:
      return openCheckTab(message.skillId);
  }
  return undefined;
}

function fromPage(message: TeachMessage, sender: Sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0) return undefined;
  if (message.type === TEACH_MESSAGE.event)
    return recordEvent(tabId, message.event);
  if (message.type === TEACH_MESSAGE.pageStop) return stop(tabId);
  return undefined;
}

export function handleTeachMessage(
  message: unknown,
  sender: Sender,
  sendResponse: (reply: RuntimeReply) => void,
) {
  if (!isTeachMessage(message)) return false;
  const panel = sender.url?.startsWith(getBrowserApi().runtime.getURL(""));
  const work = panel ? fromPanel(message) : fromPage(message, sender);
  if (!work) return false;
  return respondWith(Promise.resolve(work), sendResponse);
}
