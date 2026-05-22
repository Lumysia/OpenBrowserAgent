# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Declared in `wxt.config.ts`:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, focus tabs, open/close/reload/navigate tabs, and attach tab context to chats.
- `storage`: persist settings, providers, agents, skills, MCP servers, chats, workspaces, language, and sync status.
- `tabGroups`: group tabs and update group names/colors.
- `sidePanel`: provide the extension side panel.
- `downloads`: save Markdown exports, image ZIPs, Mermaid downloads, generated images, and fetched files.
- `debugger`: enable CDP-style browser automation, screenshots, snapshots, console/network inspection, emulation, and page-level automation when an enabled agent/tool path requires it.
- `search`: opens search tabs through the browser's configured default search engine.
- `host_permissions: ["<all_urls>"]`: allow extension tools to work across arbitrary pages, provider endpoints, MCP servers, and remote image/file URLs.

The extension page CSP allows images from `self`, `data:`, `blob:`, `http:`, and `https:` so rendered Markdown images, generated images, and Mermaid previews can display.

## Firefox Data Collection Declaration

For Firefox builds, the manifest declares required data collection permissions under `browser_specific_settings.gecko.data_collection_permissions`.

The current required declaration is intentionally conservative because OpenBrowserAgent can transmit user-selected browser context and messages to user-configured providers, search engines, and MCP servers:

- `browsingActivity`: tab URLs, titles, and browser task context may be included in model/tool requests.
- `searchTerms`: the search tool opens searches through the browser's configured default search engine.
- `websiteContent`: attached pages, selected elements, extracted text, images, and tool results may be sent to configured providers or MCP servers.
- `websiteActivity`: browser automation tools can navigate tabs, inspect pages, and interact with page state when the user enables those agent capabilities.

## Data Sent to Model Providers

Depending on user action and selected agent capabilities, requests may include:

- User messages.
- Chat history.
- Selected agent instructions and capabilities.
- Selected skills.
- Attached tab metadata, URLs, titles, and extracted page text.
- Selected element metadata such as tag name, text, input value, truncated HTML, image URL, and image data URL when captured.
- Uploaded text files as text.
- Uploaded binary/image files as data URLs or base64-like payloads when used by supported provider flows.
- Tool results and MCP results.
- Generated image prompts and optional reference attachments.

Evidence: `entrypoints/sidepanel/send-message-plan.ts`, `entrypoints/sidepanel/sidepanel-context.ts`, `entrypoints/sidepanel/selected-element-attachment.ts`, `src/background/providers.ts`, `src/background/image-generation.ts`.

## External Network Calls

OpenBrowserAgent sends data to endpoints configured by the user in Providers and MCP settings. It can also make these external calls:

- Provider APIs for chat, responses, image generation, and model fetching.
- Ollama local endpoints when configured.
- MCP Streamable HTTP server URLs configured by the user.
- Assistant link preview fetches with `credentials: "omit"`.
- Mermaid preview image URLs through `mermaid.ink` and links to `mermaid.live`.
- Page image/file download URLs when a download tool is used.

Evidence: `entrypoints/sidepanel/markdown.ts`, `src/shared/mcp-client.ts`, `src/background/downloads.ts`, `src/background/image-generation.ts`.

## Storage and Sync

Storage keys are centralized in `src/shared/storage-keys.ts`.

Stored data includes:

- Preferences and UI language.
- Provider configs, including API keys and base URLs.
- Agents and agent workspaces.
- Skills and skill files.
- MCP server definitions and headers.
- Chats and chat tabs.
- Sync write status and local sync cache entries.

Default sync preferences:

- `syncSettings: true`
- `syncProviders: true`
- `syncAgents: false`
- `syncSkills: false`
- `syncMcpServers: false`
- `syncChats: false`

Important: provider sync is enabled by default, so provider configurations may sync through browser sync. Users should treat synced provider API keys as sensitive browser-synced data.

Evidence: `src/shared/storage.ts`, `src/shared/storage-keys.ts`, `src/shared/default-preferences.ts`.

## Safety Notes

- Broad permissions are necessary for cross-site browser assistance, but they increase responsibility for careful use.
- Attached pages and selected elements may contain sensitive information.
- Browser automation tools can navigate, click, type, close tabs, download files, interact with dialogs, and modify page state.
- CDP/debugger tools are powerful and should remain gated by explicit agent capability.
- MCP tools send arguments and context to configured MCP servers.
- Tool results and page content may be truncated by size limits.

## Known Release Review Items

- Consider clearer user-facing copy for provider sync and API-key storage.
- Consider documenting exactly which agents expose CDP/browser automation capabilities in the release notes.
