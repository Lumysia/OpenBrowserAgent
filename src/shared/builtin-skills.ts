import type { Skill } from "./types";

const SKILL_CREATOR_ID = "builtin-skill-creator";
const LOCAL_EXECUTION_BRIDGE_SETUP_ID = "builtin-local-execution-bridge-setup";

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: LOCAL_EXECUTION_BRIDGE_SETUP_ID,
    name: "local-execution-bridge-setup",
    description:
      "Set up, test, update and remove OpenBrowserAgent local execution bridges. Use before localBridges add, update, test or delete, and whenever the user wants to run something on their computer but no tested bridge exists.",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    files: [
      {
        path: "SKILL.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `---
name: "local-execution-bridge-setup"
description: "Set up, test, update and remove OpenBrowserAgent local execution bridges. Use before localBridges add, update, test or delete, and whenever the user wants to run something on their computer but no tested bridge exists."
---

# Local Execution Bridge Setup

Use this skill whenever the user wants to add, configure, modify, test, use, or delete a local execution bridge.

## Core Model

- OpenBrowserAgent talks to a browser Native Messaging host; browser extension code does not run local shell commands directly.
- The bridge host validates a shared secret, receives an explicit shell command from the AI tool call, runs it through the configured shell, and returns stdout, stderr, and exit status.
- The extension-side bridge config needs a display name, Native Messaging host name, shell config ID, and secret. An optional execution host address is passed through to the bridge command without the extension interpreting protocols or managing credentials.
- Safari is not supported by this bridge path.

## Workflow

- Start with \`localBridges\` action \`list\` and avoid duplicate configs.
- If no suitable tested bridge exists, guide the user through installing/configuring one before attempting the requested shell command. Do not replace the requested local task with manual shell/file instructions unless the user explicitly asks to do it manually.
- Use the \`ask\` tool to collect missing setup information when it helps. Ask only for unknown values, keep it concise, and do not make a novice choose technical values they have not said they know.
- Prefer the published installer: \`npx openbrowseragent-local-execution-bridge@1 install ...\`. It should receive the browser target and extension ID. It does not need a per-task command during setup.
- After installer output is available, use \`localBridges\` action \`add\` or \`update\` with the printed \`hostName\`, \`commandId\` (as \`bridgeKey\`), and \`secret\`, then action \`test\`.
- \`localBridges\` action \`test\` returns the shell, basic environment information, and detected local execution bridge CLIs the bridge can see. Use that result to choose command syntax and available local tools; do not assume a default shell or installed CLI in the conversation.
- Before running work through a newly configured bridge, use \`localBridges\` action \`test\`; then call \`localCommand\` with the exact shell command only if the test succeeds.
- Use \`localBridges\` action \`delete\` for extension-side cleanup. For native bridge files, guide the user to run \`npx openbrowseragent-local-execution-bridge@1 uninstall\`.
- To update native bridge files, guide the user to run \`npx openbrowseragent-local-execution-bridge@1 update\`. This scans installed bridge manifests and refreshes the copied runtime, wrapper, and manifest while preserving existing secrets. Use \`--browser <browser-target>\` only when the user wants to update one browser, or add install arguments such as \`--extension-id\` only when repairing setup.
- Do not reinstall or rewrite the bridge for each requested local task. Install once, then send shell commands through \`localCommand\`.
- Do not use \`subAgent\` for local CLIs, desktop apps, filesystem inspection, or external local processes. Sub-agents are internal OpenBrowserAgent chat profiles; local processes run through the local execution bridge.

## Setup Inputs

Collect enough information to produce one concrete installer command without placeholders:

- Browser target, such as \`chrome\`, \`edge\`, \`brave\`, \`vivaldi\`, \`chromium\`, or \`firefox\`.
- Extension ID from the installed OpenBrowserAgent extension management page.
- Optional shell config ID, defaulting to \`default\`.
- Optional shell executable, only when the user wants a non-default shell.

## Installer Shape

Use one command tailored to the known inputs:

\`\`\`bash
npx openbrowseragent-local-execution-bridge@1 install --browser <browser-target> --extension-id <extension-id> --command-id default
\`\`\`

If the user wants a specific shell, add \`--shell <shell>\`. If the user is working from an OpenBrowserAgent source checkout and the package path is unavailable, the local fallback is \`npm run install-local-execution-bridge -- ...\`.

## Notes

- Do not put \`npx\` or \`bunx\` directly in a browser Native Messaging manifest; the installer creates a stable wrapper/runtime path.
- Do not invent weak secrets. Prefer installer-generated secrets; \`localBridges\` add/update only return generated secrets once.
- Treat \`localCommand.command\` as the shell command to execute. Do not put that shell command into the installer command.
- If testing says the native host is missing or stale, first use the tool diagnostic if present. For Brave, Vivaldi, or Chromium on Windows, ask the user to rerun the latest installer for the same browser and extension ID because it registers both browser-specific and Chrome-compatible Native Messaging registry keys. Then ask for a full browser restart and test again.
`,
      },
    ],
  },
  {
    id: SKILL_CREATOR_ID,
    name: "skill-creator",
    description:
      "Create or improve OpenBrowserAgent skills. Use when the user asks to make a skill, turn a workflow from this chat into a reusable skill, edit a SKILL.md, or fix a skill that is not picked up.",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
    files: [
      {
        path: "SKILL.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `---
name: "skill-creator"
description: "Create or improve OpenBrowserAgent skills. Use when the user asks to make a skill, turn a workflow from this chat into a reusable skill, edit a SKILL.md, or fix a skill that is not picked up."
---

# Skill Creator

A skill is a package with a required \`SKILL.md\` and optional files (\`references/\`, \`assets/\`). Every agent with skills sees each skill's name and description in its system prompt and reads the body with \`read\` source \`skill:NAME\` only when the task fits. Other files are read with \`skill:NAME/PATH\`.

## How skills are used

- The description is the only thing the agent sees before deciding to read a skill. It must say what the skill does and when to use it, with trigger words the user is likely to say.
- The body is read in full when used, so keep it short and operational: steps, rules, output format. Move long examples, tables and templates into \`references/\` and say in the body when to read each one.
- Skills are instructions, not code: files in \`scripts/\` are never run automatically.

## Workflow

1. Find the workflow: if this chat already shows it, extract the steps, tools, inputs, outputs, corrections and edge cases from it; otherwise ask (with \`ask\`) only for what is missing.
2. Write \`SKILL.md\` from the template in \`references/skill-template.md\`.
3. Save it with the \`skills\` tool (load it with toolSearch): action \`create\` with name, description and content; action \`write\` or \`patch\` to change an existing skill or add files.
4. Check it against two realistic user requests: would the description make you read it, and would the body be enough to do the task?

## Rules

- \`name\`: lowercase kebab-case.
- \`description\`: what it does + when to use it + when not to. Specific beats short.
- Reference tool names exactly; never include secrets, credentials or hidden side effects.
- Only save workflows that will be reused; one-off task details do not belong in a skill.
`,
      },
      {
        path: "references/skill-template.md",
        kind: "markdown",
        encoding: "utf-8",
        updatedAt: 0,
        content: `---
name: "my-skill-name"
description: "What this skill does. Use when the user asks for <trigger phrases, file types, sites, outputs>. Do not use for <exclusions>."
---

# Skill title

## Steps

1. ...
2. ...

## Rules

- ...

## Output

What the final answer, file or page change looks like.

## Files

- \`references/example.md\`: read when ...
`,
      },
    ],
  },
];
