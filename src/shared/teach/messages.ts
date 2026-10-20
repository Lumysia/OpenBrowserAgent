import { sendRuntimeRequest } from "../runtime-messages";
import type { TeachEvent, TeachStart, TeachUnrecorded } from "./types";

// What the side panel and the recording page ask the background, which
// keeps the recordings (see background/teach).
export const TEACH_MESSAGE = {
  // Side panel.
  start: "teach:start",
  stop: "teach:stop",
  discard: "teach:discard",
  deleteStep: "teach:deleteStep",
  markVaries: "teach:markVaries",
  keepExample: "teach:keepExample",
  rewrite: "teach:rewrite",
  save: "teach:save",
  openCheckTab: "teach:openCheckTab",
  // The recording page (its content script).
  event: "teach:event",
  unrecorded: "teach:unrecorded",
  pageStop: "teach:pageStop",
} as const;

// Background → the recording page.
export const TEACH_PAGE_MESSAGE = {
  // The value of a field the page still has, for an example the user keeps.
  example: "teach:page:example",
  // A URL the tab moved to (in the same document), without echoes of what
  // was typed there.
  redact: "teach:page:redact",
  // The recording ended: remove the pill and stop listening.
  end: "teach:page:end",
} as const;

type StepRef = { tabId: number; stepId: string };

export type TeachSave = {
  tabId: number;
  name: string;
  description: string;
};

export type TeachMessage =
  | ({ type: typeof TEACH_MESSAGE.start } & TeachStart)
  | { type: typeof TEACH_MESSAGE.stop; tabId: number }
  | { type: typeof TEACH_MESSAGE.discard; tabId: number }
  | ({ type: typeof TEACH_MESSAGE.deleteStep } & StepRef)
  | ({ type: typeof TEACH_MESSAGE.markVaries; varies: boolean } & StepRef)
  | ({ type: typeof TEACH_MESSAGE.keepExample; keep: boolean } & StepRef)
  | { type: typeof TEACH_MESSAGE.rewrite; tabId: number }
  | ({ type: typeof TEACH_MESSAGE.save } & TeachSave)
  | { type: typeof TEACH_MESSAGE.openCheckTab; skillId: string }
  | { type: typeof TEACH_MESSAGE.event; event: TeachEvent }
  | { type: typeof TEACH_MESSAGE.unrecorded; kind: keyof TeachUnrecorded }
  | { type: typeof TEACH_MESSAGE.pageStop };

const MESSAGE_TYPES = new Set<string>(Object.values(TEACH_MESSAGE));

export function isTeachMessage(message: unknown): message is TeachMessage {
  const type = (message as { type?: unknown } | undefined)?.type;
  return typeof type === "string" && MESSAGE_TYPES.has(type);
}

export function sendTeachMessage<T = unknown>(message: TeachMessage) {
  return sendRuntimeRequest<T>(message, "The background");
}

// What saving a recording gives back.
export type TeachSaved = { skillId: string; name: string };
