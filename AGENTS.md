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
- Do not keep old custom UI implementations as compatibility layers during development. When migrating a UI surface to local shadcn/Radix primitives, remove the replaced state, selectors, CSS, and event handling in the same change.
- Do not add raw ad-hoc buttons/inputs/selects in app code unless a native element is required by browser-extension constraints or a rendered Markdown/HTML boundary makes React components impossible.
- Keep animations subtle: short fades, accordion transitions, hover/press feedback, and streaming typing indicators.
- Preserve a compact sidepanel density while keeping UI colors and branding consistent with OpenBrowserAgent.
- Theme-aware UI should use shared CSS variables. Light, dark, and system modes should all be checked when changing colors, shadows, gradients, menus, popovers, or tool states.
- Accent colors should propagate consistently across settings, sidepanel, buttons, selects, tool cards, and message controls. Prefer soft derived tints over hardcoded one-off colors.
- Settings controls should use compact, purposeful UI. Prefer direct controls such as segmented choices or color swatches when they communicate better than a dropdown.
- Interactive feedback should be explicit and temporary when appropriate, such as copy buttons changing to a success icon and tooltip before resetting.

## Code Quality Rules

- Do not add hardcoded language detection. Assistant response language belongs in the model prompt: respond in the user's latest message language.
- Keep UI language selection only for extension chrome/localized UI, not for forcing assistant replies.
- Extension UI text must prefer the app's stored UI language (`storage.language` with `getMessages`/local UI registries). Use `chrome.i18n` only as a fallback for manifest/default locale or non-React content-script boundaries where the stored language is unavailable.
- Avoid hardcoded theme colors in components and stateful UI; use shared CSS variables and `src/shared/i18n.ts` for user-facing text.
- Do not add placeholder hacks, debug logs, or narrow special-case branches without an explicit product requirement.
- Keep localization maintainable: UI message definitions live in per-locale files under `src/shared/locales`, and manifest messages live under `public/_locales`. Do not expose a language option unless its UI locale is implemented.
- Keep user-facing text out of component logic unless it is a short technical fallback. Add or update locale keys instead.
- Prefer real streaming over simulated streaming. Do not wait for a full model response and then fake token chunks when the provider supports streaming.
- Keep preferences explicit and defaulted in storage. New preferences should have a type, a storage default, and a settings control when user-facing.
- Centralize reusable policy/protocol values in a registry, config, or typed constants instead of repeating literals at call sites. This applies broadly to storage areas and keys, routes and hash paths, port names, request/chunk types, DOM data selectors, state IDs, quotas, timeouts, limits, and user-visible operational messages. Local one-off copy is fine; cross-file or cross-feature behavior is not.
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

Also search for unintended third-party branding before final release work:

```bash
rg -i "<unintended brand patterns>" .
```

## Git

- Use Angular-style commit messages, for example `feat: add auto-scroll preference`, `fix: stream assistant responses`, or `chore: update project metadata`.
- Keep commits focused and avoid mixing unrelated changes when possible.
