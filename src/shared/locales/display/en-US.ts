import { plural } from "../../plural";

// Words for data the extension shows: counts, provider types, built-in
// skills and the one-line summaries of tool steps in a chat.
export const displayEnUS = {
  counts: {
    models: plural({ one: "{count} model", other: "{count} models" }),
    files: plural({ one: "{count} file", other: "{count} files" }),
    characters: plural({
      one: "{count} character",
      other: "{count} characters",
    }),
  },
  providerTypes: {
    openai: "OpenAI-compatible",
    "openai-responses": "OpenAI Responses",
    anthropic: "Anthropic-compatible",
  },
  builtinSkills: {
    "fill-form": {
      name: "Fill form",
      description:
        "Fills in web forms from details you give or a file, checks every field, and submits only when you say so.",
    },
    "tidy-tabs": {
      name: "Tidy tabs",
      description:
        "Closes duplicate tabs, groups related ones, and finds tabs you no longer need.",
    },
    "openbrowseragent-help": {
      name: "OpenBrowserAgent help",
      description:
        "Answers questions about using and setting up OpenBrowserAgent.",
    },
    "skill-creator": {
      name: "Skill creator",
      description:
        "Creates, saves, or improves skills, for example from a task you just did.",
    },
    "local-execution-bridge-setup": {
      name: "Local execution bridge setup",
      description:
        "Sets up, tests, updates, or removes a local execution bridge so agents can run commands on your computer.",
    },
  },
  toolSteps: {
    page: "Page",
    tabs: plural({ one: "{count} tab", other: "{count} tabs" }),
    lines: plural({ one: "{count} line", other: "{count} lines" }),
    matches: plural({ one: "{count} match", other: "{count} matches" }),
    results: plural({ one: "{count} result", other: "{count} results" }),
    items: plural({ one: "{count} item", other: "{count} items" }),
    editsApplied: plural({
      one: "{applied} of {count} edit applied",
      other: "{applied} of {count} edits applied",
    }),
    tabActions: {
      open: "Opened",
      switch: "Switched to",
      close: "Closed",
      navigate: "Navigated",
      back: "Went back",
      forward: "Went forward",
      reload: "Reloaded",
      group: "Grouped",
      ungroup: "Ungrouped",
    },
    // The act steps are joined into one line with actStepSeparator, e.g.
    // "Typed in 2 fields, selected 2 options, clicked 1 element".
    actStepSeparator: ", ",
    actSteps: {
      click: plural({
        one: "clicked {count} element",
        other: "clicked {count} elements",
      }),
      type: plural({
        one: "typed in {count} field",
        other: "typed in {count} fields",
      }),
      press: plural({
        one: "pressed {count} key",
        other: "pressed {count} keys",
      }),
      select: plural({
        one: "selected {count} option",
        other: "selected {count} options",
      }),
      hover: plural({
        one: "hovered over {count} element",
        other: "hovered over {count} elements",
      }),
      scroll: plural({
        one: "scrolled {count} time",
        other: "scrolled {count} times",
      }),
      wait: plural({
        one: "waited {count} time",
        other: "waited {count} times",
      }),
      drag: plural({
        one: "dragged {count} element",
        other: "dragged {count} elements",
      }),
      dialog: plural({
        one: "answered {count} dialog",
        other: "answered {count} dialogs",
      }),
      other: plural({
        one: "ran {count} other step",
        other: "ran {count} other steps",
      }),
    },
  },
};

export type DisplayMessages = typeof displayEnUS;
