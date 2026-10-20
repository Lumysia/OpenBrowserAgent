import type { RuntimeFailure } from "../runtime-messages";

// Teach mode: the user shows a browser task once (a recording), and it
// becomes an ordinary skill. A recording holds what was done and to which
// element, described by meaning only; never what was typed (see
// docs/permissions-and-privacy.md).

export const TEACH_LIMITS = {
  // Steps after which the side panel suggests stopping: long recordings
  // make poor skills.
  warnSteps: 40,
  // Steps a recording keeps; later ones are not recorded.
  maxSteps: 100,
  // The same action twice within this time is one action.
  duplicateMs: 200,
  // A navigation this soon after a click or a submit is its result, not a
  // step of its own.
  causedNavigationMs: 5_000,
  // A recording with no step for this long stops.
  idleMinutes: 15,
  // Characters kept of a target's name, label or container, and of the
  // nearest heading and a page's title (page-text.ts).
  nameChars: 80,
  labelChars: 48,
  // Characters of the user's own notes (what it is for, what changes).
  noteChars: 500,
  // How long the browser's user activation lasts after a press or key
  // (about 5 s in browsers), how often the page checks for activation it
  // saw no input for, and how long a press on a control waits for its
  // click (see teach-recorder/unseen.ts).
  activationMs: 5_000,
  unseenCheckMs: 250,
  missedClickMs: 1_000,
} as const;

// What a target is, by meaning: the role and accessible name the agent's
// snapshot shows, and what else names it on the page. `path` (tags only,
// see structural-path.ts) is a last resort hint.
export type TeachTarget = {
  role: string;
  name: string;
  tag: string;
  label?: string;
  placeholder?: string;
  // The element's `name` attribute and its `id` (ids that look generated
  // are left out).
  nameAttribute?: string;
  id?: string;
  // Links: where it goes, without query, fragment or credentials.
  href?: string;
  // The container around it ("form Sign in") and the nearest heading.
  container?: string;
  heading?: string;
  path?: string;
};

// The page a step happened on: its title and the URL as origin + path
// pattern (no query or fragment).
export type TeachPage = { title: string; url: string };

// A committed field: never its value, only what kind of field it is, how
// long the entry was and whether it is secret.
export type TeachField = {
  inputType: string;
  length: number;
  secret: boolean;
  // Enter was pressed in the field (typed, then submitted).
  submitted?: boolean;
  // A non-secret example value the user chose to keep.
  example?: string;
};

export const TEACH_STEP_KIND = {
  click: "click",
  field: "field",
  choose: "choose",
  toggle: "toggle",
  key: "key",
  navigate: "navigate",
  openTab: "openTab",
  switchTab: "switchTab",
} as const;

export type TeachStepKind =
  (typeof TEACH_STEP_KIND)[keyof typeof TEACH_STEP_KIND];

export type TeachStep = {
  id: string;
  kind: TeachStepKind;
  at: number;
  page: TeachPage;
  target?: TeachTarget;
  field?: TeachField;
  // choose: the option picked (its label); toggle: checked or not.
  choice?: string;
  checked?: boolean;
  // key: the shortcut ("Control+S", "Escape").
  key?: string;
  // switchTab: the site of a tab outside the recording.
  site?: string;
  // The page a click or submit led to.
  leadsTo?: string;
  // The user marked it "changes each time".
  varies?: boolean;
};

// What the content script reports: a step before the background numbers it,
// with the fingerprints of values typed since its last report (see
// redact.ts), which the recording keeps apart from its steps.
export type TeachEvent = Omit<TeachStep, "leadsTo" | "varies"> & {
  typed?: string[];
};

// What the user did that the recording could not see: input the page kept
// from the recorder, and embedded frames the user worked in.
export type TeachUnrecorded = { input: number; frames: number };

export const TEACH_STATE = {
  recording: "recording",
  // Stopped without the user (its tab closed, it went idle) or before they
  // allowed the provider: waits for them to write it from the side panel.
  ended: "ended",
  writing: "writing",
  review: "review",
  failed: "failed",
} as const;

export type TeachState = (typeof TEACH_STATE)[keyof typeof TEACH_STATE];

export const TEACH_ENDED_BY = {
  tabClosed: "tabClosed",
  idle: "idle",
  consent: "consent",
} as const;

export type TeachEndedBy = (typeof TEACH_ENDED_BY)[keyof typeof TEACH_ENDED_BY];

// The skill the model wrote from a recording, before the user saves it.
export type TeachDraft = {
  name: string;
  description: string;
  body: string;
};

// One recording, from Start to the saved skill. Kept in storage.session
// (see background/teach/sessions.ts) by the tab it started in.
export type TeachSession = {
  id: string;
  // The tab it started in and the tabs opened from them.
  tabId: number;
  tabIds: number[];
  startedAt: number;
  lastEventAt: number;
  startUrl: string;
  purpose: string;
  varies: string;
  steps: TeachStep[];
  state: TeachState;
  // Steps left out after maxSteps.
  dropped: number;
  draft?: TeachDraft;
  // Why writing the skill failed, as a runtime failure so the side panel
  // shows a known error in the UI language.
  failure?: RuntimeFailure;
  // Why an ended recording ended.
  endedBy?: TeachEndedBy;
  // A recording that redoes a skill from one of its steps on: the skill,
  // and the steps kept from its demonstration.
  redo?: { skillId: string; fromStep: number };
  // Fingerprints of the values typed so far and their key (redact.ts), so
  // later pages and navigations lose echoes of them. Never in the skill.
  typedKey?: string;
  typed?: string[];
  unrecorded?: TeachUnrecorded;
};

// What the user starts a recording with.
export type TeachStart = {
  tabId: number;
  purpose?: string;
  varies?: string;
  redo?: TeachSession["redo"];
};
