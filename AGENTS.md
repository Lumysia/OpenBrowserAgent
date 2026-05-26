# OpenBrowserAgent

## Project Goal

OpenBrowserAgent is a WXT/Vite/React/TypeScript browser extension for AI-assisted browsing, page understanding, and browser automation.

## Hard Constraints

- Keep the product name as `OpenBrowserAgent` unless the user explicitly requests another unrelated brand.
- Keep the repository self-contained and maintainable as a normal source project.
- Do not add third-party brand names, domains, extension IDs, or DOM prefixes unless they are required provider names or user-facing integrations.

## Stack

- WXT for extension entrypoints and manifest generation.
- React + TypeScript for UI.
- shadcn-style components live under `src/ui/components`.
- Radix primitives and `class-variance-authority` are allowed for shadcn-compatible components.
- Shared storage/types/browser helpers live under `src/shared`.

## UI Rules

- Use local shadcn/Radix components from `src/ui/components` for reusable controls and interactions. If a primitive is missing, add a local wrapper instead of building one-off DOM behavior.
- Avoid raw ad-hoc controls, feature-specific CSS, and compatibility layers. When replacing UI, remove the old selectors, state, and event handling in the same change.
- Keep the sidepanel compact, responsive, theme-aware, and consistent with OpenBrowserAgent branding. Use shared CSS variables and ensure long labels/IDs cannot push actions out of view.
- Settings surfaces must share the same visual language across sections. Reuse or extract common structures for headers, summaries, badges, actions, rows, chips, popovers, and empty states.
- Do not fix UI issues with narrow one-off patches. If a pattern repeats, fix the shared component/class/variant.
- Typography, actions, destructive states, icon-only buttons, tooltips, feedback states, icons, spacing, and microcopy should be consistent and accessible.
- Keep animations subtle and preserve real streaming/typing affordances unless the user explicitly accepts a UX tradeoff.

## Communication Rules

- Respond in Chinese when the user writes in Chinese, unless the user explicitly requests another language or the response is constrained by code, logs, commands, or external text.

## Code Quality Rules

- Prefer the best maintainable engineering solution over the smallest possible diff. Do not use narrow one-off patches to hide symptoms, bypass shared contracts, or fix only the visible call site. If a problem points to a shared abstraction, state flow, sync protocol, rendering pipeline, or data contract, fix that layer instead.
- When a bug crosses state management, synchronization, background protocols, tool execution, or UI rendering, inspect the full flow and fix the shared abstraction or contract rather than adding local special cases.
- Prefer simpler, more general logic over accumulating special cases. Refactors should reduce conceptual complexity, clarify ownership, and make future behavior easier to reason about.
- Do not guess root causes. If the code path or trace mapping is unclear, gather evidence first; for production/minified performance issues, build with sourcemaps or temporary diagnostics and ask the user for a new trace/repro instead of patching by assumption.
- For performance work, use trace/profile evidence when available and optimize the proven root cause rather than the easiest hotspot. Do not degrade streaming UX, animations, responsiveness, data consistency, or browser-extension protocol behavior to reduce CPU unless the user explicitly accepts that tradeoff.
- Revert or replace changes that are proven ineffective or cause functional regressions. Do not keep a performance patch just because it improves a metric if it breaks rendering, drops content, changes sync semantics, or creates stale UI.
- Refactor when it improves correctness, removes duplication, clarifies ownership, or prevents repeat regressions. Keep refactors focused on the problem area and verify behavior end to end.
- Keep React state updaters pure. Do not perform storage writes, network calls, logging-only side effects, port messages, or other side effects inside functional state updater callbacks; expose explicit APIs or effects for immediate persistence when needed.
- Do not add hardcoded language detection. UI language settings are only for extension chrome/localized UI, not assistant replies.
- Extension UI text must prefer stored UI language (`storage.language` with local registries). Use `chrome.i18n` only as fallback or where stored language is unavailable.
- Avoid hardcoded theme colors and user-facing strings. Use shared CSS variables and locale files under `src/shared/locales`.
- Do not add placeholder hacks, debug logs, or narrow special-case branches without an explicit product requirement.
- Keep localization complete: update every supported locale for user-facing UI strings, keep Simplified and Traditional Chinese separate, and do not expose unimplemented locales.
- Prefer real streaming over simulated streaming. Do not wait for a full model response and then fake token chunks when the provider supports streaming.
- Keep preferences explicit and defaulted in storage. New preferences should have a type, a storage default, and a settings control when user-facing.
- Settings changes must take effect in the UI immediately. Do not couple visible state updates to delayed `chrome.storage.sync` writes; persist a local immediate value/cache first and let sync flush in the background.
- Centralize reusable policy/protocol values in registries, config, or typed constants instead of repeating cross-file literals.
- UI navigation that opens options pages or existing web URLs should reuse and focus an existing tab instead of blindly creating duplicates. Use shared tab-navigation helpers for settings, source citations, references, and similar UI links; reserve raw `chrome.tabs.create` for explicit browser automation tools or product flows that must open a new tab.
- Keep source files under 500 lines by default. If a file approaches the limit, split by responsibility into components, hooks, helpers, registries, or feature modules before adding more behavior. Exceptions require a clear reason such as generated code, static data, or compact protocol/schema declarations.
- Format changed source files with Prettier before verification.

## Browser Tool Rules

- Browser automation tool names are part of the internal sidepanel/background protocol; keep them stable unless changing both sides together.
- Tools that need tab DOM access should use `chrome.scripting.executeScript` and return serializable JSON only.
- If a tool needs a Chrome permission, update `wxt.config.ts` explicitly.
- Do not silently remove existing tool names; sidepanel and background protocol compatibility matters.

## Verification

Run after meaningful changes:

```bash
npm run compile
npm run build
```

- Always run `npm run build` after UI changes before telling the user to review or reload the extension.
- If a production/minified issue cannot be located confidently, create a sourcemap-enabled build or add temporary diagnostics, then ask for a new trace/repro. Do not commit temporary diagnostics or sourcemap-only config unless explicitly requested.

Search for unintended third-party branding before final release work:

```bash
rg -i "<unintended brand patterns>" .
```

## Git

- Use Angular-style commit messages.
- Keep commits focused and avoid mixing unrelated changes when possible.
- Before committing, review the pending diff against every rule in this file. Check each changed file for UI rules, code quality rules, browser tool protocol stability, localization completeness, source-file size, formatting, and required verification. Do not commit until the review is complete and any exceptions are explicit.
