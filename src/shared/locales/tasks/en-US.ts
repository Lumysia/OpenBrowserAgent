import { plural } from "../../plural";

// Scheduled tasks and page watches: the task list in the side panel, its
// form, notifications, and the agent permission and settings they use.
export const tasksEnUS = {
  title: "Tasks",
  untitled: "Untitled task",
  count: plural({ one: "{count} task", other: "{count} tasks" }),
  newTask: "New task",
  editTask: "Edit task",
  makeTask: "Make this a task",
  empty: "No tasks yet",
  emptyHint:
    "Have the agent do something later, on a schedule, or when a page changes.",
  kinds: {
    once: "Once",
    interval: "Repeat",
    daily: "Daily",
    weekly: "Weekly",
    watch: "Watch a page",
  },
  units: {
    minutes: plural({ one: "{count} minute", other: "{count} minutes" }),
    hours: plural({ one: "{count} hour", other: "{count} hours" }),
    days: plural({ one: "{count} day", other: "{count} days" }),
  },
  unitNames: {
    minutes: "minutes",
    hours: "hours",
    days: "days",
  },
  form: {
    title: "Title",
    prompt: "What to do",
    promptPlaceholder: "Check the news on this page and summarize what is new",
    watchPrompt: "Condition and what to report",
    watchPromptPlaceholder: "Tell me when the price drops below 50",
    kind: "When",
    at: "Date and time",
    every: "Every",
    unit: "Unit",
    time: "Time",
    days: "Days",
    url: "Page address",
    part: "Part of the page",
    partPage: "Main content",
    partElement: "Selected element",
    pickElement: "Pick on page",
    checkEvery: "Check every (minutes)",
    watchHint:
      "Each check reads the page without the model; the agent runs only when the watched text changed.",
    agent: "Agent",
    mayAct:
      "This agent may act on its own: runs can use its tools that click, type or change things.",
    looksOnly:
      "Runs only look: they read, search and report, and never click, type or change anything.",
    device: "Runs on",
    thisDevice: "{name} (this device)",
    save: "Save task",
    invalidPrompt: "Say what the task should do.",
    invalidUrl: "Enter an http or https address.",
    invalidAt: "Pick a date and time.",
  },
  schedule: {
    once: "Once, {time}",
    every: "Every {amount}",
    daily: "Daily at {time}",
    weekly: "{days} at {time}",
    watch: plural({
      one: "Watches {page} every {count} minute",
      other: "Watches {page} every {count} minutes",
    }),
  },
  status: {
    running: "Running",
    paused: "Paused",
    pausedFailures: "Paused after repeated failures",
    needsUser: "Needs you",
    allPaused: "All tasks are paused",
    otherDevice: "Runs on {device}",
    done: "Done",
  },
  results: {
    reported: "Reported",
    nothing: "Nothing new",
    met: "Condition met",
    notMet: "Condition not met",
    unchanged: "No change",
    needsUser: "Needs you",
    failed: "Failed",
  },
  lastRun: "Last run {time}",
  nextRun: "Next run {time}",
  actions: {
    runNow: "Run now",
    pause: "Pause",
    resume: "Resume",
    edit: "Edit",
    delete: "Delete task",
    deleteConfirm: "Delete this task? Its past results stay in chat history.",
    openResult: "Open result",
  },
  notify: {
    titlePrefix: {
      result: "Task result",
      met: "Watch",
      needsUser: "Task needs you",
      paused: "Task paused",
    },
    finished: "The task finished. Open it to see the result.",
    conditionMet: "The watched condition is met.",
    needsUser: "The task needs your answer to go on.",
    paused: "The task failed several times in a row and is paused.",
  },
  agentPermission: {
    label: "Act on its own",
    description:
      "In scheduled tasks and watches, may use its tools that click, type, submit or change things. Off: those runs only look.",
  },
  settings: {
    title: "Scheduled tasks",
    description:
      "Tasks and watches run in the background while the browser is open.",
    pauseAll: "Pause all tasks",
    pauseAllDescription:
      "No scheduled task or watch runs until you turn this off, on every device.",
    notificationsUnavailable:
      "This browser has no system notifications: results show on the toolbar button and in the task list.",
  },
  tool: {
    scheduleTask: { running: "Scheduling a task", done: "Scheduled a task" },
    taskResult: {
      running: "Reporting the outcome",
      done: "Reported the outcome",
    },
  },
};

export type TasksLocaleMessages = typeof tasksEnUS;
