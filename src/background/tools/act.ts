import { delay } from "../../shared/cancellation";
import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { getBrowserApi } from "../../shared/storage";
import { TOOL_NAME } from "../../shared/tool-names";
import { withCdp } from "../cdp";
import { callPage, pageTab, PageError } from "../page-agent";
import { pageHeader } from "./page";
import { tabLine, waitTabComplete } from "./tabs";
import {
  errorMessage,
  fail,
  schema,
  stringArg,
  type ToolDefinition,
} from "./types";

const STEP_SETTLE_MS = 120;
const BATCH_SETTLE_MS = 300;
const WAIT_DEFAULT_MS = 1_000;
const WAIT_MAX_MS = 10_000;
const MAX_STEPS = 30;
const MAX_EDITS = 100;

const ACTIONS = [
  "click",
  "type",
  "press",
  "select",
  "hover",
  "scroll",
  "wait",
  "drag",
];

type Step = Record<string, unknown> & { action: string };

function stepLabel(step: Step) {
  const target = step.ref ? ` ${step.ref}` : "";
  if (step.action === "type")
    return `type${target} "${String(step.text ?? "").slice(0, 40)}"`;
  if (step.action === "press") return `press ${step.key || "Enter"}${target}`;
  if (step.action === "select")
    return `select${target} "${step.value ?? step.text ?? ""}"`;
  if (step.action === "wait")
    return step.text
      ? `wait for "${step.text}"`
      : `wait ${step.ms || WAIT_DEFAULT_MS}ms`;
  if (step.action === "drag") return `drag${target} to ${step.to}`;
  if (step.action === "scroll")
    return `scroll${target}${step.direction ? ` ${step.direction}` : ""}`;
  return `${step.action}${target}`;
}

async function waitStep(tabId: number, step: Step, signal?: AbortSignal) {
  const ms = Math.min(
    WAIT_MAX_MS,
    Math.max(0, Number(step.ms) || WAIT_DEFAULT_MS),
  );
  const text = stringArg(step.text);
  if (!text) {
    await delay(ms, signal);
    return undefined;
  }
  const end = Date.now() + (Number(step.ms) ? ms : 5_000);
  while (Date.now() < end) {
    const { value } = await callPage<boolean>(
      tabId,
      "hasText",
      { text },
      signal,
    );
    if (value) return undefined;
    await delay(250, signal);
  }
  return `"${text}" did not appear. Take a snapshot to see the page.`;
}

// Typing into editors that ignore synthetic input, through the debugger.
async function trustedType(tabId: number, step: Step, signal?: AbortSignal) {
  if (!areCdpAvailable())
    return "This editor ignores page-script typing, and real keyboard input needs the Chrome debugger, which this browser lacks.";
  const text = String(step.text ?? "");
  await callPage(
    tabId,
    "prepareTrusted",
    { ref: step.ref, clear: step.clear !== false },
    signal,
  );
  await withCdp(
    { tabId },
    (send) => send("Input.insertText", { text }),
    signal,
  );
  await delay(STEP_SETTLE_MS, signal);
  const { value } = await callPage<string>(
    tabId,
    "editableText",
    { ref: step.ref },
    signal,
  );
  if (!value.includes(text.replace(/\s+/g, " ").trim()))
    return `The editor did not accept the text (it now shows "${value.slice(0, 80)}").`;
  if (step.submit === true) {
    const result = await callPage<{ ok: boolean; error?: string }>(
      tabId,
      "step",
      { step: { action: "press", ref: step.ref, key: "Enter" } },
      signal,
    );
    if (!result.value.ok) return result.value.error;
  }
  return undefined;
}

async function runPageStep(tabId: number, step: Step, signal?: AbortSignal) {
  if (step.action === "wait")
    return { error: await waitStep(tabId, step, signal) };
  const { value } = await callPage<{
    ok: boolean;
    error?: string;
    note?: string;
    trusted?: boolean;
  }>(tabId, "step", { step }, signal);
  if (value.trusted) return { error: await trustedType(tabId, step, signal) };
  return { error: value.ok ? undefined : value.error, note: value.note };
}

const pageUrl = (url: string) => url.split("#")[0];

export const actTool: ToolDefinition = {
  name: TOOL_NAME.act,
  group: "browser",
  timeoutMs: 120_000,
  summary: "Click, type, select, press keys, scroll on a page",
  description:
    "Run steps on a page in order, by snapshot ref: click, type (text; clear defaults to true; submit presses Enter), press (key like Enter or Control+A; ref optional), select (value or option text of a select), hover, scroll (ref, or direction up/down/top/bottom), wait (ms, or text to wait for), drag (ref to ref 'to'). Stops at the first failing step. Returns what changed (navigation, new or gone controls, dialogs), not a full snapshot.",
  parameters: schema(
    {
      tabId: { type: "number", description: "Defaults to the active tab." },
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
          },
          ["action"],
        ),
      },
    },
    ["steps"],
  ),
  async execute(input, { signal }) {
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
    const tab = await pageTab(input.tabId);
    const opened: chrome.tabs.Tab[] = [];
    const onCreated = (created: chrome.tabs.Tab) => {
      if (created.openerTabId === tab.id) opened.push(created);
    };
    api.tabs.onCreated.addListener(onCreated);
    const done: string[] = [];
    let failure = "";
    let navigated = false;
    try {
      await callPage(tab.id, "begin", {}, signal);
      for (const [index, step] of steps.entries()) {
        let result: { error?: string; note?: string };
        try {
          result = await runPageStep(tab.id, step, signal);
        } catch (error) {
          if (!(error instanceof PageError)) signal?.throwIfAborted();
          result = { error: errorMessage(error) };
        }
        if (result.error) {
          failure = `Step ${index + 1} (${stepLabel(step)}) failed: ${result.error}${index < steps.length - 1 ? " Later steps were not run." : ""}`;
          break;
        }
        done.push(
          `${index + 1}. ${stepLabel(step)}${result.note ? ` (${result.note})` : ""}`,
        );
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
      api.tabs.onCreated.removeListener(onCreated);
    }
    const lines = [pageHeader(tab)];
    if (done.length) lines.push(`Done: ${done.join("; ")}`);
    if (failure) lines.push(failure);
    const after = await api.tabs.get(tab.id);
    let changes: string[] = [];
    let fresh = navigated;
    if (!navigated) {
      try {
        const { value } = await callPage<{ lines: string[]; fresh?: boolean }>(
          tab.id,
          "changes",
          {},
          signal,
        );
        changes = value.lines;
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
    for (const created of opened) {
      const current = await api.tabs.get(created.id!).catch(() => created);
      lines.push(`Opened new ${tabLine(current).slice(2)}`);
    }
    lines.push(...changes);
    const moved = steps.some((step) =>
      ["scroll", "wait"].includes(step.action),
    );
    if (!failure && !changes.length && !fresh && !opened.length && !moved)
      lines.push(
        "No visible change in the viewport. Check with snapshot or find if you expected one.",
      );
    const text = lines.join("\n");
    return {
      text,
      details: {
        tabId: tab.id,
        steps: steps.length,
        done: done.length,
        ...(failure ? { error: failure } : {}),
      },
      isError: !!failure,
    };
  },
};

const EDIT_OPS = [
  "setText",
  "insert",
  "remove",
  "setAttribute",
  "removeAttribute",
  "style",
  "css",
];

type Edit = Record<string, unknown> & { op: string };

export const editPageTool: ToolDefinition = {
  name: TOOL_NAME.editPage,
  group: "browser",
  compactArgs: true,
  summary: "Change page content and style",
  description:
    "Edit the page in place by snapshot ref, in one batch: setText (text; keep links by writing them as [label](e12) like the snapshot), insert (text or html at position before/after/prepend/append; tag optional; returns the new ref), remove, setAttribute / removeAttribute (name, value), style (inline CSS in value), css (stylesheet text in value, no ref). For translation, replace each block's text with setText. Stops at the first failing edit.",
  parameters: schema(
    {
      tabId: { type: "number", description: "Defaults to the active tab." },
      edits: {
        type: "array",
        minItems: 1,
        items: schema(
          {
            op: { type: "string", enum: EDIT_OPS },
            ref: { type: "string" },
            text: { type: "string" },
            html: { type: "string" },
            position: {
              type: "string",
              enum: ["before", "after", "prepend", "append"],
            },
            tag: { type: "string" },
            name: { type: "string" },
            value: { type: "string" },
          },
          ["op"],
        ),
      },
    },
    ["edits"],
  ),
  async execute(input, { signal }) {
    const edits = (Array.isArray(input.edits) ? input.edits : []).filter(
      (edit): edit is Edit =>
        !!edit &&
        typeof edit === "object" &&
        typeof (edit as Edit).op === "string",
    );
    if (!edits.length)
      return fail(
        "edits is required: a list like [{op:'setText', ref:'e12', text:'…'}].",
      );
    if (edits.length > MAX_EDITS)
      return fail(`At most ${MAX_EDITS} edits per call; split the batch.`);
    const tab = await pageTab(input.tabId);
    let applied = 0;
    const inserted: string[] = [];
    let error = "";
    // Page edits run in the page; stylesheet edits through the extension API,
    // keeping the batch order.
    for (let start = 0; start < edits.length && !error;) {
      const edit = edits[start];
      if (edit.op === "css") {
        const css = String(edit.value ?? edit.text ?? "");
        try {
          await getBrowserApi().scripting.insertCSS({
            target: { tabId: tab.id },
            css,
          });
          applied++;
        } catch (cause) {
          error = `Edit ${start + 1} (css) failed: ${errorMessage(cause)}`;
        }
        start++;
        continue;
      }
      let end = start;
      while (end < edits.length && edits[end].op !== "css") end++;
      const { value } = await callPage<{
        applied: number;
        inserted: string[];
        error?: string;
      }>(tab.id, "edits", { ops: edits.slice(start, end) }, signal);
      applied += value.applied;
      inserted.push(...value.inserted);
      if (value.error)
        error = value.error.replace(
          /^Edit (\d+)/,
          (_, n) => `Edit ${start + Number(n)}`,
        );
      start = end;
    }
    const lines = [
      `Applied ${applied} of ${edits.length} edits on tab ${tab.id}.`,
    ];
    if (inserted.length) lines.push(`Inserted: ${inserted.join(", ")}`);
    if (error) lines.push(`${error} Later edits were not applied.`);
    return {
      text: lines.join("\n"),
      details: {
        tabId: tab.id,
        edits: edits.length,
        applied,
        ...(error ? { error } : {}),
      },
      isError: !!error,
    };
  },
};
