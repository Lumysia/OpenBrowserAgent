import { delay } from "../../shared/cancellation";
import { getBrowserApi } from "../../shared/browser-api";
import { TOOL_NAME } from "../../shared/tool-names";
import { adoptAgentTab } from "../agent-tabs";
import {
  downloadsStartedSince,
  startedDownloadLines,
} from "../downloads/page-downloads";
import { callPage, pageTab, PageError } from "../page-agent";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import { watchOpenedTabs } from "../user-focus";
import {
  dialogLines,
  endDialogs,
  runStep,
  STEP_SETTLE_MS,
  stepLabel,
  watchDialogs,
  type Step,
  type StepOutcome,
} from "./act-steps";
import { CONTEXT_POLICY, tokenChars } from "../context/policy";
import { pageHeader } from "./page";
import { tabLine, waitTabComplete } from "./tabs";
import { errorMessage } from "../../shared/error-message";
import { fail, schema, type ToolDefinition } from "./types";

const BATCH_SETTLE_MS = 300;
const MAX_STEPS = 30;

const ACTIONS = [
  "click",
  "type",
  "press",
  "select",
  "hover",
  "scroll",
  "wait",
  "drag",
  "dialog",
];

const pageUrl = (url: string) => url.split("#")[0];

export const actTool: ToolDefinition = {
  name: TOOL_NAME.act,
  group: "browser",
  timeoutMs: 120_000,
  summary: "Click, type, select, press keys, scroll on a page",
  description:
    "Run steps on a page in order, by snapshot ref: click (double for a double-click; or x,y viewport pixels from a screenshot), type (text; clear defaults to true; submit presses Enter), press (key like Enter or Control+A; ref optional), select (value or option text of a select), hover, scroll (ref, or direction up/down/top/bottom), wait (ms, or text to wait for), drag (ref to ref 'to'), dialog (value accept or dismiss, text for a prompt: how JavaScript dialogs opened by later steps are answered; without it they are dismissed and reported). trusted: true sends real mouse or keyboard input for click, hover and press when the page ignores the normal ones. Click, hover and drag on an element another one covers (a banner, an overlay) fail and name the cover: close it, or act on it; force: true acts on the covered element anyway, only for a cover you know is decorative. Stops at the first failing step. Returns what changed (navigation, new or gone controls, dialogs, new or changed text), not a full snapshot.",
  parameters: schema(
    {
      tabId: RUN_TAB_ID_PARAM,
      snapshot: {
        type: "boolean",
        description:
          "Also return a short snapshot of the viewport after the steps, instead of a separate snapshot call.",
      },
      steps: {
        type: "array",
        minItems: 1,
        items: schema(
          {
            action: { type: "string", enum: ACTIONS },
            ref: { type: "string" },
            text: { type: "string" },
            key: { type: "string" },
            value: { type: "string" },
            to: { type: "string" },
            direction: {
              type: "string",
              enum: ["up", "down", "top", "bottom"],
            },
            ms: { type: "number" },
            clear: { type: "boolean" },
            submit: { type: "boolean" },
            double: { type: "boolean" },
            trusted: { type: "boolean" },
            force: { type: "boolean" },
            x: { type: "number" },
            y: { type: "number" },
          },
          ["action"],
        ),
      },
    },
    ["steps"],
  ),
  async execute(input, { run, signal }) {
    const steps = (Array.isArray(input.steps) ? input.steps : []).filter(
      (step): step is Step =>
        !!step &&
        typeof step === "object" &&
        typeof (step as Step).action === "string",
    );
    if (!steps.length)
      return fail(
        "steps is required: a list like [{action:'click', ref:'e12'}].",
      );
    if (steps.length > MAX_STEPS)
      return fail(`At most ${MAX_STEPS} steps per call.`);
    const api = getBrowserApi();
    const tab = await pageTab(run.tab, input.tabId);
    let opened: number[] = [];
    const done: string[] = [];
    let failure = "";
    let navigated = false;
    const record = (index: number, step: Step, result: StepOutcome) => {
      if (result.error) {
        failure = `Step ${index + 1} (${stepLabel(step)}) failed: ${result.error}${index < steps.length - 1 ? " Later steps were not run." : ""}`;
        return false;
      }
      done.push(
        `${index + 1}. ${stepLabel(step)}${result.note ? ` (${result.note})` : ""}`,
      );
      return true;
    };
    const begin = async () => {
      await callPage(tab.id, "begin", {}, signal);
      await watchDialogs(tab.id, signal);
    };
    let first = 0;
    const since = Date.now();
    try {
      await begin();
    } catch (error) {
      // A dialog that opened outside a batch blocks the page; a leading
      // dialog step answers it before the batch starts.
      if (!(error instanceof PageError) || steps[0].action !== "dialog")
        throw error;
      if (!record(0, steps[0], await runStep(tab.id, steps[0], signal)))
        return fail(`${pageHeader(tab)}\n${failure}`);
      first = 1;
      await delay(STEP_SETTLE_MS, signal);
      await begin();
    }
    const watch = await watchOpenedTabs(tab.id);
    try {
      for (const [index, step] of steps.entries()) {
        if (index < first) continue;
        let result: StepOutcome;
        try {
          result = await runStep(tab.id, step, signal);
        } catch (error) {
          if (!(error instanceof PageError)) signal?.throwIfAborted();
          result = { error: errorMessage(error) };
        }
        if (!record(index, step, result)) break;
        await delay(STEP_SETTLE_MS, signal);
        const current = await api.tabs.get(tab.id);
        if (
          current.status === "loading" ||
          pageUrl(current.url || "") !== pageUrl(tab.url)
        ) {
          await waitTabComplete(tab.id, signal);
          // A route change inside the page keeps its refs; a new document
          // does not.
          const same = await callPage<boolean>(
            tab.id,
            "sameDocument",
            {},
            signal,
          )
            .then((reply) => reply.value)
            .catch(() => false);
          if (!same) {
            navigated = true;
            if (index < steps.length - 1)
              failure = `The page loaded a new document after step ${index + 1}; the remaining steps were not run because their refs belong to the old page.`;
            break;
          }
        }
      }
      await delay(BATCH_SETTLE_MS, signal);
    } finally {
      opened = await watch.stop();
    }
    const dialogs = dialogLines(
      await endDialogs(tab.id),
      steps.some((step) => step.action === "dialog"),
    );
    const lines = [pageHeader(tab)];
    if (done.length) lines.push(`Done: ${done.join("; ")}`);
    if (failure) lines.push(failure);
    lines.push(...dialogs);
    const after = await api.tabs.get(tab.id);
    let changes: string[] = [];
    // The focused control and text that changes on its own (a clock):
    // shown, never a change.
    let notes: string[] = [];
    let fresh = navigated;
    if (!navigated) {
      try {
        const { value } = await callPage<{
          lines: string[];
          notes?: string[];
          fresh?: boolean;
        }>(tab.id, "changes", {}, signal);
        changes = value.lines;
        notes = value.notes || [];
        fresh = !!value.fresh;
      } catch (error) {
        signal?.throwIfAborted();
        changes = [`(Could not read changes: ${errorMessage(error)})`];
      }
    }
    if (fresh || pageUrl(after.url || "") !== pageUrl(tab.url))
      lines.push(
        `Now at: ${after.title || "(untitled)"} | ${after.url}${fresh ? ". This is a new page: take a snapshot for refs." : ""}`,
      );
    // A tab that turned into a download is gone by now.
    const openTabs: chrome.tabs.Tab[] = [];
    for (const id of opened) {
      const current = await api.tabs.get(id).catch(() => undefined);
      if (current) openTabs.push(current);
    }
    for (const current of openTabs) {
      await adoptAgentTab(run, current);
      lines.push(
        `Opened new ${tabLine(current, { mine: true }).slice(2)}. Pass its tabId to work on it.`,
      );
    }
    lines.push(...changes);
    const downloads = await downloadsStartedSince(run, since, signal);
    lines.push(...startedDownloadLines(downloads));
    const moved = steps.some((step) =>
      ["scroll", "wait", "dialog"].includes(step.action),
    );
    if (
      !failure &&
      !changes.length &&
      !dialogs.length &&
      !fresh &&
      !openTabs.length &&
      !downloads.length &&
      !moved
    )
      lines.push(
        "No visible change in the viewport. Check with snapshot or find if you expected one.",
      );
    lines.push(...notes);
    if (input.snapshot === true)
      lines.push(await viewportSnapshot(tab.id, signal));
    return {
      text: lines.join("\n"),
      details: {
        tabId: tab.id,
        steps: steps.length,
        done: done.length,
        ...(downloads.length ? { downloads } : {}),
        ...(failure ? { error: failure } : {}),
      },
      isError: !!failure,
    };
  },
};

// The viewport after the steps, capped small: act results stay short.
async function viewportSnapshot(tabId: number, signal?: AbortSignal) {
  const maxChars = tokenChars(CONTEXT_POLICY.actSnapshotTokens);
  try {
    const { value } = await callPage<{ text: string }>(
      tabId,
      TOOL_NAME.snapshot,
      {
        scope: "viewport",
        capChars: maxChars,
        maxChars,
        itemCap: CONTEXT_POLICY.actSnapshotItems,
      },
      signal,
    );
    return `Snapshot:\n${value.text}`;
  } catch (error) {
    signal?.throwIfAborted();
    return `(Could not take a snapshot: ${errorMessage(error)})`;
  }
}
