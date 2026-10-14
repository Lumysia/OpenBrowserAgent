import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import type { SmartBarGenerateAction } from "./smart-bar";

// What page UI (the smart bar, the context menu) hands to the side panel. The
// background opens the panel during the user's gesture and leaves the
// handoff in storage; the panel takes it when it is ready.
export const SIDE_PANEL_TASK = {
  // Attach the page and any selected text, and focus the composer.
  ask: "ask",
  // A smart bar result, continued in a new chat.
  continue: "continue",
  summarizePage: "summarizePage",
  // About the selected text when there is some, otherwise about the page.
  searchWeb: "searchWeb",
  summarizeLink: "summarizeLink",
} as const;

export type SidePanelTask =
  (typeof SIDE_PANEL_TASK)[keyof typeof SIDE_PANEL_TASK];

export type SidePanelHandoffRequest =
  | { task: typeof SIDE_PANEL_TASK.ask; text?: string }
  | {
      task: typeof SIDE_PANEL_TASK.continue;
      text: string;
      result: { action: SmartBarGenerateAction; text: string };
    }
  | { task: typeof SIDE_PANEL_TASK.summarizePage }
  | { task: typeof SIDE_PANEL_TASK.searchWeb; text?: string }
  | { task: typeof SIDE_PANEL_TASK.summarizeLink; linkUrl: string };

export type SidePanelHandoff = SidePanelHandoffRequest & {
  id: string;
  // The window whose side panel takes it.
  windowId?: number;
  // The page it is about.
  tabId?: number;
  pageTitle?: string;
  pageUrl?: string;
  createdAt: number;
};

// A handoff the side panel did not pick up within this time is dropped.
export const SIDE_PANEL_HANDOFF_TTL_MS = 60_000;

// Session storage keeps the selected text off disk; browsers without it use
// local storage (the panel removes the entry when it takes it).
export function sidePanelHandoffStorage() {
  const api = getBrowserApi();
  return api.storage.session
    ? {
        area: api.storage.session,
        name: "session",
        key: STORAGE_KEYS.sidePanelHandoff,
      }
    : {
        area: api.storage.local,
        name: "local",
        key: STORAGE_KEYS.sidePanelHandoff,
      };
}

const TASKS = new Set<string>(Object.values(SIDE_PANEL_TASK));

// A stored handoff, or undefined for anything else (an entry in an older
// shape is dropped like an expired one).
export function readSidePanelHandoff(
  value: unknown,
): SidePanelHandoff | undefined {
  const handoff = value as Partial<SidePanelHandoff> | undefined;
  if (
    !handoff ||
    typeof handoff.id !== "string" ||
    typeof handoff.createdAt !== "number" ||
    !TASKS.has(String(handoff.task))
  )
    return undefined;
  if (handoff.task === SIDE_PANEL_TASK.continue && !handoff.result)
    return undefined;
  if (
    handoff.task === SIDE_PANEL_TASK.summarizeLink &&
    typeof handoff.linkUrl !== "string"
  )
    return undefined;
  return handoff as SidePanelHandoff;
}
