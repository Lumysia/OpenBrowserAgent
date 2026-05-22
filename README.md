# OpenBrowserAgent

OpenBrowserAgent is an AI browser side panel for understanding pages, researching the web, and completing browser tasks with you in control.

It turns your browser into an AI working surface: bring page context into chat, switch between focused Q&A and action-oriented agent mode, connect your own models, and extend the assistant with reusable skills and remote MCP tools.

## Why Use It

- **Work where the web already is.** Ask questions about the current page, compare tabs, summarize content, and keep sources close to the browser session.
- **Move from answers to action.** Agent mode can inspect pages, navigate tabs, click, type, search, download content, and use richer browser automation tools when needed.
- **Bring your own AI stack.** Configure model providers, API keys, base URLs, chat models, and image models without being locked into one backend.
- **Extend it with skills and MCP.** Save repeatable workflows as skills, import skill packages, and connect tested remote Streamable HTTP MCP servers for external tools like search and fetch.
- **Stay in control.** Tools are visible as they run, MCP servers must be tested before enabling, individual MCP tools can be toggled, and detailed tool JSON is available on demand.

## Highlights

- **Side panel chat** with streaming responses, queued messages, attachment-aware context, and polished tool activity cards.
- **Agent and Ask modes** for either browser automation or page-focused questions.
- **Tab and page context** including current tab metadata, page content, selected elements, and source-aware outputs.
- **Remote MCP tools** with built-in Exa seed, JSON import, test-before-enable flow, per-tool enable switches, and citation extraction from MCP results.
- **Reusable skills** with built-in browser guidance, skill import/export, editable skill files, and reset-to-default controls.
- **Source citations** that keep final answers tied to pages, files, skills, generated outputs, and MCP-provided web results.
- **Product-grade settings** for providers, models, appearance, language, sync, debug reset, skills, and MCP servers.
- **Theme-aware UI** with light/dark/system modes, accent colors, compact density, subtle motion, and localized interface text.

## Typical Workflows

- Research a topic from the side panel, fetch pages through an MCP search/fetch provider, and receive a cited summary.
- Ask questions about the active tab or attached pages without leaving the browser.
- Let the agent fill forms, click controls, organize tabs, or inspect page state while showing each tool step.
- Create a custom skill for a recurring workflow, then reuse it across chats.
- Configure multiple model providers and choose the best model for chat or image generation.

## Documentation

- [Product overview](docs/product-overview.md)
- [Installation and packaging](docs/installation-and-packaging.md)
- [Permissions and privacy](docs/permissions-and-privacy.md)
- [Release checklist](docs/release-checklist.md)
- [Media assets guide](docs/media-assets.md)

## Development

```bash
npm install
npm run dev
```

Browser-specific development targets are also available:

```bash
npm run dev:firefox
npm run dev:safari
```

## Build

```bash
npm run build
npm run build:firefox
npm run build:safari
```

Build outputs are written to `.output/chrome-mv3`, `.output/firefox-mv2`, and `.output/safari-mv2`.
