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
    openai: "OpenAI (or compatible)",
    "openai-responses": "OpenAI (Responses API)",
    anthropic: "Anthropic (or compatible)",
    gemini: "Google Gemini",
    ollama: "Ollama (local)",
  },
  // Recommended MCP servers (mcp-presets.ts), by name: what each offers.
  mcpServerPresets: {
    exa: "Web search and webpage content extraction.",
    parallel: "Web search with excerpts, and webpage fetching.",
    tinyfish: "Web and news search.",
    firecrawl:
      "Web search, webpage scraping and document parsing. Low free rate limit.",
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
  errors: {
    noModel: "No model is set up. Add a provider in Settings → AI providers.",
    noImageModel:
      "No image model is set up. Choose one in Settings → AI providers.",
    baseUrlRequired: "Enter a base URL.",
    bridgeNotFound: "This execution bridge no longer exists.",
    bridgeHostRequired: "Enter the native messaging host name.",
    bridgeTimeout: "The execution bridge didn’t answer in time.",
    syncKeysLocked:
      "Your API keys are synced but locked. Enter your sync passphrase in Settings → Sync.",
    teachUnscriptable: "This page can't be recorded.",
    tabRecording:
      "This tab is being recorded. Stop the recording before the agent works in it.",
  },
  toolSteps: {
    // A step that failed; the error text, written for the model, is in
    // the step's details.
    failed: "Failed",
    page: "Page",
    tabs: plural({ one: "{count} tab", other: "{count} tabs" }),
    lines: plural({ one: "{count} line", other: "{count} lines" }),
    matchingLines: plural({
      one: "{count} matching line",
      other: "{count} matching lines",
    }),
    matchingLinesWithOccurrences: plural({
      one: "{count} matching line ({occurrences})",
      other: "{count} matching lines ({occurrences})",
    }),
    occurrences: plural({
      one: "{count} occurrence",
      other: "{count} occurrences",
    }),
    results: plural({ one: "{count} result", other: "{count} results" }),
    items: plural({ one: "{count} item", other: "{count} items" }),
    tools: plural({ one: "{count} tool", other: "{count} tools" }),
    // Workspace files a runCode step saved.
    filesSaved: plural({
      one: "{count} file saved",
      other: "{count} files saved",
    }),
    editsApplied: plural({
      one: "{applied} of {count} edit applied",
      other: "{applied} of {count} edits applied",
    }),
    // The action a tool step took, by its `action` argument; tabs, workspace,
    // skills and the other tools share these words.
    actions: {
      open: "Opened",
      switch: "Switched to",
      close: "Closed",
      navigate: "Navigated",
      back: "Went back",
      forward: "Went forward",
      reload: "Reloaded",
      group: "Grouped",
      ungroup: "Ungrouped",
      list: "Listed",
      search: "Searched",
      read: "Read",
      write: "Wrote",
      append: "Appended",
      replace: "Replaced text",
      delete: "Deleted",
      create: "Created",
      patch: "Edited",
      add: "Added",
      update: "Updated",
      test: "Tested",
      status: "Checked status",
      resources: "Listed network resources",
      emulate: "Emulated a device",
      reset: "Reset emulation",
      capture: "Started recording",
      captured: "Read the recording",
      request: "Read a request",
      download: "Downloaded",
      save: "Saved",
      wait: "Waited for a download",
      retry: "Retried",
      images: "Saved images",
      run: "Ran",
      start: "Started",
      cancel: "Canceled",
      get: "Looked up",
      runNow: "Started a run",
      pause: "Paused",
      resume: "Resumed",
    },
    commandStates: {
      running: "Running",
      done: "Finished",
      error: "Failed",
      canceled: "Canceled",
      missing: "Task not found",
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
