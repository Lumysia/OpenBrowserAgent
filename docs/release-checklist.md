# Release Checklist

Use this checklist before publishing a release or release candidate.

## Code and Build

- Working tree is clean: `git status --short`.
- TypeScript passes: `npm run compile`.
- Production build passes: `npm run build`.
- Zip package builds: `npm run zip`.
- Dependency audit passes: `npm audit --json` reports zero vulnerabilities.
- No debug logging or temporary test hooks remain.
- No unintended third-party branding appears in UI text.

## Manual QA

- Fresh install with no providers configured shows a setup path.
- Provider creation, model fetching, model test, and default model selection work.
- Sidepanel chat streams normally.
- Stop, retry, queued send, fork, copy, and chat history work.
- Auto-scroll follows at the bottom, stops when the user scrolls away, resumes when the user returns to bottom, and resumes on retry/new streaming.
- Long responses with code blocks, images, math, and Mermaid diagrams remain stable.
- Tab context attachment, selected element attachment, and file upload work.
- Browser tools show visible cards and useful summaries.
- Built-in agents are read-only; custom agents are editable.
- Skill import/export, validation, duplication, enable/disable, and reset work.
- Agent import/export and workspace file editing work.
- MCP server import/test/enable/tool toggle works.
- Sync settings behave as expected.
- Debug reset actions use the expected scope and destructive styling.

## Theme and Layout

- Light, dark, and system themes are checked.
- Accent colors propagate across settings, sidepanel, buttons, selects, tool cards, and message controls.
- Narrow option-page widths do not overflow long names, IDs, or action rows.
- Sidepanel compact density remains usable.
- Segmented controls render consistently in light and dark themes.

## Documentation

- README links to release docs.
- Installation and packaging instructions are current.
- Permissions and privacy page is current.
- Known limitations are documented.
- Release notes mention broad browser permissions and provider/API-key storage behavior.

## Suggested Release Path

1. Publish a GitHub prerelease such as `v0.1.0-rc.1`.
2. Attach the zip created by `npm run zip`.
3. Include screenshots or a short GIF in the release notes.
4. Run a small manual test pass after installing from the attached zip.
5. Promote to stable only after no blocking issues are found.
