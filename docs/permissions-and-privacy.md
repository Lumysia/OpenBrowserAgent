# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Permissions differ by browser target.

All builds declare:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, focus tabs, open/close/reload/navigate tabs, and attach tab context to chats.
- `storage`: persist settings, providers, agents, skills, MCP servers, chats, workspaces, language, and sync status.
- `downloads`: save Markdown exports, image ZIPs, Mermaid downloads, generated images, and fetched files.
- `host_permissions: ["<all_urls>"]`: allow extension tools to work across arbitrary pages, provider endpoints, MCP servers, and remote image/file URLs.

Chrome/Chromium builds additionally declare:

- `tabGroups`: group tabs and update group names/colors.
- `sidePanel`: provide the extension side panel.
- `debugger`: enable CDP-style browser automation, screenshots, snapshots, console/network inspection, emulation, and page-level automation when an enabled agent/tool path requires it.
- `search`: opens search tabs through the browser's configured default search engine.

Firefox and Safari builds omit the Chrome-only `tabGroups`, `sidePanel`, `debugger`, and `search` permissions. Safari-compatible builds open `sidepanel.html` as an extension tab when the extension action is clicked because the Chrome side panel API is not available there.

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

## External Network Calls

OpenBrowserAgent sends data to endpoints configured by the user in Providers and MCP settings. It can also make these external calls:

- Provider APIs for chat, responses, image generation, and model fetching.
- Ollama local endpoints when configured.
- MCP Streamable HTTP server URLs configured by the user.
- Assistant link preview fetches with `credentials: "omit"`.
- Mermaid preview image URLs through `mermaid.ink` and links to `mermaid.live`.
- Page image/file download URLs when a download tool is used.

## Storage and Sync

Stored data includes:

- Preferences and UI language.
- Provider configs, including API keys and base URLs.
- Agents and agent workspaces.
- Skills and skill files.
- MCP server definitions and headers.
- Local execution bridge configurations and secrets.
- Chats and chat tabs.
- Sync write status and local sync cache entries.

Language and lightweight preferences use the selected sync backend. Provider sync is enabled by default. Agents, skills, MCP servers, local execution bridges, chats, and chat attachments remain local unless the user enables their sync options.

Important: provider sync is enabled by default, so provider configurations may sync through browser sync. Users should treat synced provider API keys as sensitive browser-synced data.

## Safe Use

- Broad permissions are necessary for cross-site browser assistance, but they increase responsibility for careful use.
- Attached pages and selected elements may contain sensitive information.
- Browser automation tools can navigate, click, type, close tabs, download files, interact with dialogs, and modify page state.
- Debugger-powered automation is available only when the selected agent has that capability enabled.
- MCP tools send arguments and context to configured MCP servers.
- Tool results and page content may be truncated by size limits.
