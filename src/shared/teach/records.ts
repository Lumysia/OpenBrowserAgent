import { sessionRecord } from "../session-record";
import { STORAGE_KEYS } from "../storage-keys";
import type { TeachSession } from "./types";

// Recordings by the tab they started in, for the browser session only: a
// restarted service worker or a reopened side panel finds them, and they
// are gone when the browser closes.
export const teachSessions = sessionRecord<Record<string, TeachSession>>(
  STORAGE_KEYS.teachSessions,
  () => ({}),
);

// The recording a tab belongs to (it started there or was opened from it).
export function sessionOfTab(
  sessions: Record<string, TeachSession>,
  tabId: number | undefined,
) {
  if (tabId === undefined) return undefined;
  return Object.values(sessions).find((session) =>
    session.tabIds.includes(tabId),
  );
}

// How a check run of a recorded skill came out, by chat, so the side panel
// can offer what comes next.
export type SkillCheckResult = {
  skillId: string;
  passed: boolean;
  // The step (1-based) where the run went differently.
  divergedAt?: number;
  summary: string;
  at: number;
};

export const skillChecks = sessionRecord<Record<string, SkillCheckResult>>(
  STORAGE_KEYS.skillChecks,
  () => ({}),
);
