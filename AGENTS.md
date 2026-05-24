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

- Use the local shadcn-style components from `src/ui/components` for buttons, inputs, textarea, select, cards, badges, labels, and accordions.
- Prefer local shadcn/Radix primitives for interactive UI instead of custom interaction code. Tooltips, popovers, dropdowns, scroll containers, accordions, selects, switches, buttons, inputs, textareas, cards, badges, labels, and similar reusable UI behavior should be implemented through `src/ui/components` first. If a primitive is missing, add a local shadcn-style wrapper around the Radix primitive instead of building one-off CSS/DOM behavior.
- Do not add custom CSS classes or one-off styles for UI layout/state unless existing shadcn/Radix components, existing shared utility classes, and component props cannot reasonably express the design. If custom CSS is unavoidable, keep it generic and reusable rather than feature-specific.
- Do not keep old custom UI implementations as compatibility layers during development. When migrating a UI surface to local shadcn/Radix primitives, remove the replaced state, selectors, CSS, and event handling in the same change.
- Do not add raw ad-hoc buttons/inputs/selects in app code unless a native element is required by browser-extension constraints or a rendered Markdown/HTML boundary makes React components impossible.
- Keep animations subtle: short fades, accordion transitions, hover/press feedback, and streaming typing indicators.
- Preserve a compact sidepanel density while keeping UI colors and branding consistent with OpenBrowserAgent.
- Theme-aware UI should use shared CSS variables. Light, dark, and system modes should all be checked when changing colors, shadows, gradients, menus, popovers, or tool states.
- Accent colors should propagate consistently across settings, sidepanel, buttons, selects, tool cards, and message controls. Prefer soft derived tints over hardcoded one-off colors.
- Settings controls should use compact, purposeful UI. Prefer direct controls such as segmented choices or color swatches when they communicate better than a dropdown.
- Settings page visual language must stay consistent across General, Providers, MCP, Agents, Skills, Sync, and Debug. Before changing one surface, inspect comparable surfaces and shared styles first; fix the shared component/style when the issue is a pattern.
- Do not solve UI issues with narrow one-off patches. For repeated structures such as page headers, accordion summaries, badges, button variants, popovers, model rows, file rows, and validation/status chips, extract or reuse a common component/class/variant and remove obsolete feature-specific styles.
- Settings typography should be restrained and consistent: page titles are the strongest text, section/card/accordion titles should use the shared title styles, descriptions and metadata should use muted text with lighter weight, and badges should not inherit heavy parent font weights. Avoid raw `strong`/`b` for layout titles; use local title components/classes instead.
- Settings action buttons should use shared `Button` variants. Every icon-only button must have a `Tooltip` and accessible label; use icon-only buttons only when the surrounding context and tooltip make the action clear. Confirmation buttons inside popovers should generally include text. Destructive actions should use the shared destructive variant that matches the surface instead of ordinary outline buttons with delete icons.
- Settings layouts must be responsive by construction. Long provider/model names, IDs, badges, and translated strings must not push buttons out of view; use `minmax(0, 1fr)`, `min-width: 0`, wrapping action rows, and ellipsis where appropriate. Check narrow option-page widths after changing grids or flex rows.
- Interactive feedback should be explicit and temporary when appropriate, such as copy buttons changing to a success icon and tooltip before resetting.
- UI quality is product quality. Tool cards, menus, settings surfaces, empty states, and debug panels should have complete visual affordances such as appropriate icons, labels, spacing, and state feedback. Do not treat icons, hierarchy, or polished microcopy as narrow one-off fixes; keep them consistent and reusable across the product.

## Code Quality Rules

- Prefer the best maintainable engineering solution over the smallest possible diff. Narrow patches are only acceptable when the underlying design is already sound and the change fully addresses the issue.
- When a bug crosses state management, synchronization, background protocols, tool execution, or UI rendering, inspect the full flow and fix the shared abstraction or contract rather than adding local special cases.
- Refactor when it improves correctness, removes duplication, clarifies ownership, or prevents repeat regressions. Keep refactors focused on the problem area and verify behavior end to end.
- Keep React state updaters pure. Do not perform storage writes, network calls, logging-only side effects, port messages, or other side effects inside functional state updater callbacks; expose explicit APIs or effects for immediate persistence when needed.
- Do not add hardcoded language detection. Assistant response language belongs in the model prompt: respond in the user's latest message language.
- Keep UI language selection only for extension chrome/localized UI, not for forcing assistant replies.
- Extension UI text must prefer the app's stored UI language (`storage.language` with `getMessages`/local UI registries). Use `chrome.i18n` only as a fallback for manifest/default locale or non-React content-script boundaries where the stored language is unavailable.
- Avoid hardcoded theme colors in components and stateful UI; use shared CSS variables and `src/shared/i18n.ts` for user-facing text.
- Do not add placeholder hacks, debug logs, or narrow special-case branches without an explicit product requirement.
- Keep localization maintainable: UI message definitions live in per-locale files under `src/shared/locales`, and manifest messages live under `public/_locales`. Do not expose a language option unless its UI locale is implemented.
- When adding or changing any user-facing UI string, update every supported locale at the same time. Do not rely on English fallback for implemented UI languages. Keep Simplified Chinese and Traditional Chinese as separate locale files with appropriate wording.
- Keep user-facing text out of component logic unless it is a short technical fallback. Add or update locale keys instead.
- Prefer real streaming over simulated streaming. Do not wait for a full model response and then fake token chunks when the provider supports streaming.
- Keep preferences explicit and defaulted in storage. New preferences should have a type, a storage default, and a settings control when user-facing.
- Settings changes must take effect in the UI immediately. Do not couple visible state updates to delayed `chrome.storage.sync` writes; persist a local immediate value/cache first and let sync flush in the background.
- Centralize reusable policy/protocol values in a registry, config, or typed constants instead of repeating literals at call sites. This applies broadly to storage areas and keys, routes and hash paths, port names, request/chunk types, DOM data selectors, state IDs, quotas, timeouts, limits, and user-visible operational messages. Local one-off copy is fine; cross-file or cross-feature behavior is not.
- UI navigation that opens options pages or existing web URLs should reuse and focus an existing tab instead of blindly creating duplicates. Use shared tab-navigation helpers for settings, source citations, references, and similar UI links; reserve raw `chrome.tabs.create` for explicit browser automation tools or product flows that must open a new tab.
- Keep source files under 500 lines by default. If a file approaches the limit, split by responsibility into components, hooks, helpers, registries, or feature modules before adding more behavior. Exceptions require a clear reason such as generated code, static data, or compact protocol/schema declarations.
- Format changed source files with Prettier before verification.

## Browser Tool Rules

- Browser automation tool names are part of the internal sidepanel/background protocol; keep them stable unless changing both sides together.
- Tools that need tab DOM access should use `chrome.scripting.executeScript` and return serializable JSON only.
- If a tool needs a Chrome permission, update `wxt.config.ts` explicitly.
- Do not silently remove existing tool names; sidepanel and background protocol compatibility matters.

## Verification

Run these after meaningful changes:

```bash
npm run compile
npm run build
```

- Always run `npm run build` after UI changes before telling the user to review or reload the extension; the user cannot reliably inspect sidepanel/options UI changes until the extension bundle is rebuilt.

Also search for unintended third-party branding before final release work:

```bash
rg -i "<unintended brand patterns>" .
```

## Git

- Use Angular-style commit messages, for example `feat: add auto-scroll preference`, `fix: stream assistant responses`, or `chore: update project metadata`.
- Keep commits focused and avoid mixing unrelated changes when possible.
- Before committing, review the pending diff against every rule in this file. Check each changed file for UI rules, code quality rules, browser tool protocol stability, localization completeness, source-file size, formatting, and required verification. Do not commit until the review is complete and any exceptions are explicit.
