import { trimmedString } from "../../shared/values";
import { textSlice } from "../tools/read";
import { fail, ok, type ToolContext, type ToolResult } from "../tools/types";
import {
  captureEntryDetail,
  captureNotFound,
  capturedSummary,
  startCapture,
} from "./capture";
import { CAPTURE_KINDS, type CaptureKind } from "./capture-store";

// The devtools actions that record and read a tab's network and console.

export const CAPTURE_ACTIONS = ["capture", "captured", "request"] as const;
type CaptureAction = (typeof CAPTURE_ACTIONS)[number];

export const isCaptureAction = (action: string): action is CaptureAction =>
  (CAPTURE_ACTIONS as readonly string[]).includes(action);

// Characters of one request's details per call.
const DETAIL_MAX_CHARS = 4000;

export const CAPTURE_PARAMETERS = {
  include: {
    type: "array",
    items: { type: "string", enum: [...CAPTURE_KINDS] },
    description: "capture: what to record. Defaults to all.",
  },
  all: {
    type: "boolean",
    description:
      "captured: list successful requests and every console level too.",
  },
  clear: { type: "boolean", description: "captured: then start over." },
  stop: { type: "boolean", description: "captured: then stop recording." },
  id: { type: "string", description: "request: an id from captured." },
  offset: { type: "number", description: "request: where to continue." },
};

function includeOf(value: unknown): CaptureKind[] | string {
  if (value === undefined) return [...CAPTURE_KINDS];
  const list = Array.isArray(value) ? value.map(String) : [];
  const unknown = list.filter(
    (item) => !(CAPTURE_KINDS as readonly string[]).includes(item),
  );
  if (!list.length || unknown.length)
    return `include takes a list of ${CAPTURE_KINDS.join(", ")}.`;
  return [...new Set(list)] as CaptureKind[];
}

export async function runCaptureAction(
  action: CaptureAction,
  tabId: number,
  input: Record<string, unknown>,
  { run, signal }: ToolContext,
): Promise<ToolResult> {
  const details = { action, tabId };
  if (action === "capture") {
    const include = includeOf(input.include);
    if (typeof include === "string") return fail(include);
    const { continued } = await startCapture(tabId, include, run, signal);
    return ok(
      `${continued ? "Still recording" : "Recording"} ${include.join(", ")} on tab ${tabId}, across reloads and navigations in it, until {"action":"captured","stop":true} or the end of this reply. The browser shows a "being debugged" bar meanwhile. Now reproduce the problem (reload, act, or ask the user to try it and wait for their answer), then read {"action":"captured"}.`,
      { ...details, include },
    );
  }
  if (action === "captured") {
    const summary = await capturedSummary(tabId, {
      all: input.all === true,
      clear: input.clear === true,
      stop: input.stop === true,
    });
    if (!summary) return fail(captureNotFound(tabId));
    return ok(summary.text, {
      ...details,
      recording: summary.active,
      entries: summary.entries,
    });
  }
  const id = trimmedString(input.id);
  if (!id) return fail('request needs an id from {"action":"captured"}.');
  const detail = await captureEntryDetail(tabId, id, signal);
  if ("error" in detail) return fail(detail.error);
  return ok(
    textSlice(
      `request ${id} on tab ${tabId}`,
      detail.text,
      input,
      DETAIL_MAX_CHARS,
    ),
    { ...details, id },
  );
}
