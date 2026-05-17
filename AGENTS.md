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
- Do not add raw ad-hoc buttons/inputs/selects in app code unless a native element is required by browser-extension constraints.
- Keep animations subtle: short fades, accordion transitions, hover/press feedback, and streaming typing indicators.
- Preserve a compact sidepanel density while keeping UI colors and branding consistent with OpenBrowserAgent.
- Theme-aware UI should use shared CSS variables. Light, dark, and system modes should all be checked when changing colors, shadows, gradients, menus, popovers, or tool states.
- Accent colors should propagate consistently across settings, sidepanel, buttons, selects, tool cards, and message controls. Prefer soft derived tints over hardcoded one-off colors.
- Settings controls should use compact, purposeful UI. Prefer direct controls such as segmented choices or color swatches when they communicate better than a dropdown.
- Interactive feedback should be explicit and temporary when appropriate, such as copy buttons changing to a success icon and tooltip before resetting.

## Code Quality Rules

- Do not add hardcoded language detection. Assistant response language belongs in the model prompt: respond in the user's latest message language.
- Keep UI language selection only for extension chrome/localized UI, not for forcing assistant replies.
- Avoid hardcoded theme colors in components and stateful UI; use shared CSS variables and `src/shared/i18n.ts` for user-facing text.
- Do not add placeholder hacks, debug logs, or narrow special-case branches without an explicit product requirement.
- Keep localization maintainable: UI message definitions live in per-locale files under `src/shared/locales`, and manifest messages live under `public/_locales`. Do not expose a language option unless its UI locale is implemented.
- Keep user-facing text out of component logic unless it is a short technical fallback. Add or update locale keys instead.
- Prefer real streaming over simulated streaming. Do not wait for a full model response and then fake token chunks when the provider supports streaming.
- Keep preferences explicit and defaulted in storage. New preferences should have a type, a storage default, and a settings control when user-facing.
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

Also search for unintended third-party branding before final release work:

```bash
rg -i "<unintended brand patterns>" .
```

## Git

- Use Angular-style commit messages, for example `feat: add auto-scroll preference`, `fix: stream assistant responses`, or `chore: update project metadata`.
- Keep commits focused and avoid mixing unrelated changes when possible.
