# OpenBrowserAgent

OpenBrowserAgent is an AI browser side panel for understanding pages, working across tabs, and automating repetitive browser tasks.

It turns the browser into a working surface for AI: attach the current page, select elements, ask questions, run actions, and let the assistant operate with browser-aware tools while you stay in control.

## What It Does

- Chat with an AI assistant directly from the browser side panel.
- Use `Agent` mode for browser automation and `Ask` mode for page-focused questions.
- Attach tabs as context, including current page metadata and page content when needed.
- Select page elements and let the assistant use them as structured context.
- Configure your own AI providers, models, and base URLs.
- Create skills for repeated prompts and workflows.
- Stream assistant responses and tool activity in the UI.
- Customize light/dark/system appearance, accent colors, language, and auto-scroll behavior.

## Product Highlights

- **Browser-native workflow:** Runs as a Chrome MV3 extension with a dedicated side panel.
- **Bring your own model:** Supports configurable providers instead of locking the user into one backend.
- **Tool-aware assistant:** Browser tools can inspect tabs, read page content, search, click, type, group tabs, download content, and more.
- **Context first:** Tabs, selected elements, skills, and current page context are treated as first-class inputs.
- **Polished local UI:** Compact side panel, themed settings, streaming states, copy feedback, and multilingual interface support.

## Tech Stack

- WXT + Chrome MV3
- Vite
- React + TypeScript
- Radix UI primitives
- shadcn-style local components
- CSS variables for theme and accent systems

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The generated extension is written to `.output/` and can be loaded from Chrome's `Load unpacked` flow.

## Project Structure

- `entrypoints/background.ts` - MV3 service worker, provider calls, browser tools, and AI streaming protocol.
- `entrypoints/sidepanel/` - React side panel chat UI with Agent/Ask modes, skills, tab attachment, and element selection.
- `entrypoints/options/` - React settings UI for providers, models, language, appearance, preferences, and skills.
- `src/shared/` - storage schema, provider contracts, browser helpers, locale registry, and message types.
- `src/ui/` - local UI components, shared styles, theme variables, and hooks.
- `public/` - icons, manifest locale messages, and injected selector script.
