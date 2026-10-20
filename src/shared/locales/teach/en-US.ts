import { plural } from "../../plural";

// Teach mode: recording a task the user shows once, the steps while it
// records, the skill written from it and its check run.
export const teachEnUS = {
  menu: {
    title: "Record a skill",
    hint: "Show the agent a task once",
  },
  pill: {
    recording: "Recording",
    stop: "Stop",
    stopHint: "Stop recording and write the skill",
  },
  start: {
    title: "Record a skill",
    description:
      "Do the task yourself on this page, then press Stop. The recording becomes a skill.",
    purpose: "What is this for? (optional)",
    purposePlaceholder: "Submit my weekly timesheet",
    varies: "What changes each time? (optional)",
    variesPlaceholder: "The week and the project",
    privacy:
      "What you type is not recorded, only which field you used. Passwords and codes never are.",
    start: "Start recording",
    unscriptable:
      "This page can't be recorded. Open the page where the task starts.",
  },
  recording: {
    title: "Recording",
    steps: plural({ one: "{count} step", other: "{count} steps" }),
    empty: "Do the task on the page. Each step shows up here.",
    long: "Long recordings make weaker skills. Stop once the task is done.",
    full: "The recording is full: later steps are not recorded.",
    unrecorded: plural({
      one: "{count} action on the page could not be recorded. Check that the steps are complete.",
      other:
        "{count} actions on the page could not be recorded. Check that the steps are complete.",
    }),
    frames: plural({
      one: "Steps in {count} embedded frame were not recorded.",
      other: "Steps in {count} embedded frames were not recorded.",
    }),
    stop: "Stop",
    discard: "Discard",
    deleteStep: "Delete step",
    varies: "Changes each time",
    keepExample: "Keep what I typed as an example",
    dropExample: "Don't keep the example",
    exampleKept: "Example kept",
    exampleGone: "The page no longer has this value.",
    secret: "Secret — never stored",
  },
  step: {
    click: "Click {target}",
    field: "Type in {target}",
    fieldSubmitted: "Type in {target} and press Enter",
    choose: "Choose {choice} in {target}",
    chooseSecret: "Choose an option in {target}",
    check: "Check {target}",
    uncheck: "Uncheck {target}",
    key: "Press {key}",
    navigate: "Go to {url}",
    openTab: "New tab: {url}",
    switchTab: "Switched to {site}",
    page: "the page",
  },
  writing: {
    title: "Writing the skill…",
    description: "The model turns the recorded steps into instructions.",
  },
  failed: {
    title: "Couldn't write the skill",
    retry: "Try again",
  },
  save: {
    title: "Save the skill",
    name: "Name",
    description: "Description",
    stored:
      "Saved as a skill with its steps: which control on which page. What you typed is not stored. It syncs like your other skills.",
    check: "Save and check",
    checkHint:
      "Runs the skill once in a new tab and asks you before the final step",
    draft: "Skip, save as draft",
  },
  check: {
    message: "Check the recorded skill {name}",
    passed: "Check passed: {name} is verified.",
    auto: "Let the agent use it automatically",
    autoOn: "The agent now uses {name} when a request fits.",
    diverged: "The check went differently at step {step}.",
    divergedNoStep: "The check went differently.",
    fix: "Fix the steps",
    fixMessage: "Fix the steps of {name} from this check",
    recordAgain: "Record again from here",
    keepDraft: "Save as draft",
    done: "Done",
  },
  status: {
    recorded: "Recorded",
    draft: "Draft",
    verified: "Verified",
  },
  skillsHint:
    "To record a skill, open the side panel on the page where the task starts and choose + → Record a skill.",
  tool: {
    skillCheck: { running: "Reporting the check", done: "Reported the check" },
  },
};

export type TeachLocaleMessages = typeof teachEnUS;
