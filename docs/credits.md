# Credits

The built-in skills in `src/shared/builtin-skill-texts/` were written for OpenBrowserAgent. Their design draws on these projects and publications; no text was copied from them.

| Source                                                                                                            | Licence    | Used for                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| [anthropics/skills](https://github.com/anthropics/skills) `skill-creator`, `webapp-testing`, `mcp-builder`        | Apache-2.0 | skill-creator (capturing a workflow from the chat, descriptions, testing) |
| [openai/codex](https://github.com/openai/codex) system skills `skill-creator`, `skill-installer`                  | Apache-2.0 | skill-creator; fill-form and tidy-tabs (confirm right before a change)    |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) system prompt                               | MIT        | fill-form (form fields, checking every value)                             |
| OpenCode `opencode`, Goose `goose-doc-guide`, Codex `openai-docs` self-help skills                                | —          | openbrowseragent-help (read the live docs instead of baked-in facts)      |
| Tab tidying in Perplexity Comet (`/update-tabs`) and Arc; skills in Gemini in Chrome (product behaviour, no text) | —          | tidy-tabs (group, then confirm before closing)                            |

## Teach mode

Recording a skill (`src/teach-recorder/`, `src/shared/teach/`, `src/background/teach/`) was written for OpenBrowserAgent; no code was copied. Its design draws on:

| Source                                                                                                       | Licence    | Used for                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------- |
| [webbrain-one/webbrain](https://github.com/webbrain-one/webbrain) `/teach`                                   | GPL-3.0    | ideas only: value-free capture, semantic targets, merge rules, no runs in a recorded tab |
| [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern) workflow recording                               | AGPL-3.0   | ideas: signals for secret fields, a draft is not verified until it ran                   |
| [browser-use/workflow-use](https://github.com/browser-use/workflow-use)                                      | AGPL-3.0   | ideas: the model names the workflow and its inputs, choices become instructions          |
| Chrome DevTools Recorder / [puppeteer/replay](https://github.com/puppeteer/replay), Playwright codegen       | Apache-2.0 | step shape and locator priority (role and name first)                                    |
| [Agent Skills specification](https://agentskills.io/specification), Agent Workflow Memory (arXiv:2409.07429) | Apache-2.0 | skill name and description rules, `references/` files; text workflows with inputs        |
