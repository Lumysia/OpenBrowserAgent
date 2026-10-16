import { clampInt, trimmedString } from "../../shared/values";
import { delay } from "../../shared/cancellation";
import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { withCdp, type CdpSend } from "../cdp";
import { callMainWorld, callPage, PageError } from "../page-agent";
import { errorMessage } from "../../shared/error-message";

// The steps of `act`: page steps run in the page with synthetic events;
// trusted steps (coordinates, `trusted: true`, editors that ignore page
// typing) use the Chrome debugger for that step only.

export type Step = Record<string, unknown> & { action: string };
export type StepOutcome = { error?: string; note?: string };

export const STEP_SETTLE_MS = 120;
const WAIT_DEFAULT_MS = 1_000;
const WAIT_MAX_MS = 10_000;
const NO_DEBUGGER =
  "Real input needs the Chrome debugger, which this browser lacks.";

export function stepLabel(step: Step) {
  const target = step.ref
    ? ` ${step.ref}`
    : step.x !== undefined
      ? ` at ${step.x},${step.y}`
      : "";
  const trusted = step.trusted === true ? " (trusted)" : "";
  if (step.action === "type")
    return `type${target} "${String(step.text ?? "").slice(0, 40)}"`;
  if (step.action === "press")
    return `press ${step.key || "Enter"}${target}${trusted}`;
  if (step.action === "select")
    return `select${target} "${step.value ?? step.text ?? ""}"`;
  if (step.action === "wait")
    return step.text
      ? `wait for "${step.text}"`
      : `wait ${step.ms || WAIT_DEFAULT_MS}ms`;
  if (step.action === "drag") return `drag${target} to ${step.to}`;
  if (step.action === "scroll")
    return `scroll${target}${step.direction ? ` ${step.direction}` : ""}`;
  if (step.action === "dialog") return `dialog ${dialogAnswer(step)}`;
  if (step.action === "click" && step.double === true)
    return `double-click${target}${trusted}`;
  return `${step.action}${target}${trusted}`;
}

export async function runStep(
  tabId: number,
  step: Step,
  signal?: AbortSignal,
): Promise<StepOutcome> {
  if (step.action === "wait")
    return { error: await waitStep(tabId, step, signal) };
  if (step.action === "dialog") return dialogStep(tabId, step, signal);
  const atPoint = step.action === "click" && !step.ref && step.x !== undefined;
  if (
    (atPoint || step.trusted === true) &&
    (step.action === "click" || step.action === "hover")
  )
    return { error: await trustedPointer(tabId, step, signal) };
  if (step.trusted === true && step.action === "press")
    return { error: await trustedKey(tabId, step, signal) };
  const { value } = await callPage<{
    ok: boolean;
    error?: string;
    note?: string;
    trusted?: boolean;
  }>(tabId, "step", { step }, signal);
  if (value.trusted) return { error: await trustedType(tabId, step, signal) };
  return { error: value.ok ? undefined : value.error, note: value.note };
}

async function waitStep(tabId: number, step: Step, signal?: AbortSignal) {
  const ms = clampInt(step.ms, {
    fallback: WAIT_DEFAULT_MS,
    min: 0,
    max: WAIT_MAX_MS,
  });
  const text = trimmedString(step.text);
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

// Real input through the debugger. It reaches a tab in the background too;
// meanwhile the page is told it has focus, as when the user types into it,
// so pages that check document.hasFocus() or :focus behave.
async function withInput(
  tabId: number,
  input: (send: CdpSend) => Promise<unknown>,
  signal?: AbortSignal,
) {
  await withCdp(
    { tabId },
    async (send) => {
      await send("Emulation.setFocusEmulationEnabled", { enabled: true });
      try {
        await input(send);
      } finally {
        await send("Emulation.setFocusEmulationEnabled", {
          enabled: false,
        }).catch(() => undefined);
      }
    },
    signal,
  );
}

// Typing into editors that ignore synthetic input.
async function trustedType(tabId: number, step: Step, signal?: AbortSignal) {
  if (!areCdpAvailable())
    return `This editor ignores page-script typing. ${NO_DEBUGGER}`;
  const text = String(step.text ?? "");
  await callPage(
    tabId,
    "prepareTrusted",
    { ref: step.ref, clear: step.clear !== false },
    signal,
  );
  await withInput(tabId, (send) => send("Input.insertText", { text }), signal);
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

async function trustedPointer(tabId: number, step: Step, signal?: AbortSignal) {
  if (!areCdpAvailable()) return NO_DEBUGGER;
  const point = step.ref
    ? (
        await callPage<{ x: number; y: number; error?: string }>(
          tabId,
          "inputPoint",
          { ref: step.ref, pointer: true, force: step.force === true },
          signal,
        )
      ).value
    : { x: Number(step.x), y: Number(step.y) };
  if ("error" in point && point.error) return point.error;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    return "Give a ref, or x and y in viewport pixels (from a screenshot).";
  await withInput(
    tabId,
    async (send) => {
      await mouse(send, "mouseMoved", point);
      if (step.action === "hover") return;
      for (let clicks = 1; clicks <= (step.double === true ? 2 : 1); clicks++) {
        const button = { button: "left", clickCount: clicks };
        await mouse(send, "mousePressed", point, { ...button, buttons: 1 });
        await mouse(send, "mouseReleased", point, { ...button, buttons: 0 });
      }
    },
    signal,
  );
  return undefined;
}

function mouse(
  send: CdpSend,
  type: string,
  point: { x: number; y: number },
  extra: Record<string, unknown> = {},
) {
  return send("Input.dispatchMouseEvent", { type, ...point, ...extra });
}

const MODIFIERS: Record<string, number> = {
  alt: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  cmd: 4,
  shift: 8,
};
const VIRTUAL_KEYS: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Delete: 46,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  " ": 32,
};

async function trustedKey(tabId: number, step: Step, signal?: AbortSignal) {
  if (!areCdpAvailable()) return NO_DEBUGGER;
  if (step.ref)
    await callPage(tabId, "inputPoint", { ref: step.ref, focus: true }, signal);
  const parts = String(step.key || "Enter").split("+");
  const named = parts.pop() || "Enter";
  const key = named === "Space" ? " " : named;
  const modifiers = parts.reduce(
    (bits, part) => bits | (MODIFIERS[part.toLowerCase()] || 0),
    0,
  );
  const event = {
    key,
    modifiers,
    windowsVirtualKeyCode:
      VIRTUAL_KEYS[key] ||
      (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
  };
  // Chromium runs the default action (submit, insert a character) only
  // when keyDown carries the text the key produces.
  const text =
    key === "Enter" ? "\r" : key.length === 1 && !(modifiers & 6) ? key : "";
  await withInput(
    tabId,
    async (send) => {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        ...event,
        ...(text ? { text } : {}),
      });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
    },
    signal,
  );
  return undefined;
}

// Native dialogs block the page (and every later call into it) until
// answered. During a batch they are answered at once and reported: dismissed
// by default, or as the latest dialog step says.
type DialogRecord = { type: string; message: string; answer: string };

function dialogAnswer(step: Step) {
  return step.value === "dismiss" ? "dismiss" : "accept";
}

export async function watchDialogs(tabId: number, signal?: AbortSignal) {
  await callMainWorld(
    tabId,
    () => {
      const page = window as unknown as Record<string, unknown> & {
        __obaDialogs?: unknown;
      };
      if (page.__obaDialogs) return;
      const state = {
        seen: [] as DialogRecord[],
        accept: false,
        text: null as string | null,
        originals: {
          alert: page.alert,
          confirm: page.confirm,
          prompt: page.prompt,
        },
      };
      page.__obaDialogs = state;
      const note = (type: string, message: unknown, answer: string) =>
        state.seen.push({
          type,
          message: String(message ?? "").slice(0, 300),
          answer,
        });
      page.alert = (message: unknown) => note("alert", message, "closed");
      page.confirm = (message: unknown) => {
        note("confirm", message, state.accept ? "accepted" : "dismissed");
        return state.accept;
      };
      page.prompt = (message: unknown, value: unknown) => {
        const text = state.accept ? (state.text ?? String(value ?? "")) : null;
        note(
          "prompt",
          message,
          text === null ? "dismissed" : `answered "${text}"`,
        );
        return text;
      };
    },
    [],
    signal,
  );
}

// Restores the page's own dialogs and returns what the batch answered.
export async function endDialogs(tabId: number) {
  return callMainWorld(tabId, () => {
    const page = window as unknown as Record<string, unknown> & {
      __obaDialogs?: { seen: DialogRecord[]; originals: object };
    };
    const state = page.__obaDialogs;
    if (!state) return [];
    Object.assign(page, state.originals);
    delete page.__obaDialogs;
    return state.seen;
  }, []).catch(() => [] as DialogRecord[]);
}

export function dialogLines(seen: DialogRecord[], answered: boolean) {
  if (!seen.length) return [];
  const lines = seen.map(
    (dialog) => `Dialog ${dialog.type} "${dialog.message}": ${dialog.answer}.`,
  );
  if (!answered && seen.some((dialog) => dialog.answer === "dismissed"))
    lines.push(
      'To accept it, run the steps again with {action:"dialog", value:"accept"} before the step that opens it.',
    );
  return lines;
}

async function dialogStep(
  tabId: number,
  step: Step,
  signal?: AbortSignal,
): Promise<StepOutcome> {
  const accept = dialogAnswer(step) === "accept";
  // Script arguments must be JSON: null, not undefined.
  const text = step.text === undefined ? null : String(step.text);
  try {
    const watched = await callMainWorld(
      tabId,
      (accept: boolean, text: string | null) => {
        const state = (
          window as unknown as {
            __obaDialogs?: { accept: boolean; text: string | null };
          }
        ).__obaDialogs;
        if (!state) return false;
        state.accept = accept;
        state.text = text;
        return true;
      },
      [accept, text],
      signal,
    );
    if (watched)
      return { note: `later dialogs are ${accept ? "accepted" : "dismissed"}` };
  } catch (error) {
    if (!(error instanceof PageError)) throw error;
  }
  return answerOpenDialog(tabId, accept, text, signal);
}

// A dialog that opened outside a batch, through the debugger.
async function answerOpenDialog(
  tabId: number,
  accept: boolean,
  text: string | null,
  signal?: AbortSignal,
): Promise<StepOutcome> {
  if (!areCdpAvailable())
    return {
      error: `A dialog blocks tab ${tabId}. ${NO_DEBUGGER} Ask the user to close it.`,
    };
  try {
    await withCdp(
      { tabId },
      (send) =>
        send("Page.handleJavaScriptDialog", {
          accept,
          ...(text === null ? {} : { promptText: text }),
        }),
      signal,
    );
    return { note: `the open dialog was ${accept ? "accepted" : "dismissed"}` };
  } catch (error) {
    signal?.throwIfAborted();
    return {
      error: `The open dialog in tab ${tabId} could not be answered (${errorMessage(error)}). Ask the user to close it.`,
    };
  }
}
