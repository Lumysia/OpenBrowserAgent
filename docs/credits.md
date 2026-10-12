# Credits

The built-in skills in `src/shared/builtin-skill-texts/` were written for OpenBrowserAgent. Their design draws on these projects and publications; no text was copied from them.

| Source                                                                                                            | Licence    | Used for                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| [anthropics/skills](https://github.com/anthropics/skills) `skill-creator`, `webapp-testing`, `mcp-builder`        | Apache-2.0 | skill-creator (capturing a workflow from the chat, descriptions, testing) |
| [openai/codex](https://github.com/openai/codex) system skills `skill-creator`, `skill-installer`                  | Apache-2.0 | skill-creator; fill-form and tidy-tabs (confirm right before a change)    |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) system prompt                               | MIT        | fill-form (form fields, checking every value)                             |
| OpenCode `opencode`, Goose `goose-doc-guide`, Codex `openai-docs` self-help skills                                | —          | openbrowseragent-help (read the live docs instead of baked-in facts)      |
| Tab tidying in Perplexity Comet (`/update-tabs`) and Arc; skills in Gemini in Chrome (product behaviour, no text) | —          | tidy-tabs (group, then confirm before closing)                            |
