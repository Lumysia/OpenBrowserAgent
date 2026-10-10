# Permissions and Privacy

OpenBrowserAgent is powerful because it can read browser context, automate pages, and send selected context to user-configured AI providers. This page documents what permissions are used for and what data can flow through the extension.

## Browser Permissions

Permissions differ by browser target.

All builds declare:

- `scripting`: inject scripts/CSS for page text extraction, element selection, DOM interaction, input, scrolling, and content capture.
- `tabs`: read tab metadata, list tabs, focus tabs, open/close/reload/navigate tabs, and attach tab context to chats.
- `storage`: persist settings, providers, agents, skills, MCP servers, chats, workspaces, language, and sync status.
- `unlimitedStorage`: allow local chat and attachment storage to grow beyond normal extension storage quotas; browser-sync quotas still apply.
- `downloads`: save Markdown exports, image ZIPs, Mermaid downloads, generated images, and fetched files.
- `<all_urls>` host access: allow extension tools to work across arbitrary pages, provider endpoints, MCP servers, and remote image/file URLs. Manifest V3 lists this under `host_permissions`; Manifest V2 includes it in `permissions`.

Chrome/Chromium builds additionally declare:

- `tabGroups`: group tabs and update group names/colors.
- `sidePanel`: provide the extension side panel.
- `debugger`: enable CDP-style browser automation, screenshots, snapshots, console/network inspection, emulation, and page-level automation when an enabled agent/tool path requires it.

Chromium and Firefox additionally declare:

- `search`: open search tabs through the browser's configured default search engine.
- `nativeMessaging`: connect to a separately installed local execution bridge, which can execute shell commands when enabled for the active agent.

Firefox and Safari omit the Chrome-only `tabGroups`, `sidePanel`, and `debugger` permissions. Firefox uses `sidebar_action` for its sidebar. Safari also omits `search` and `nativeMessaging`; its action opens or focuses `sidepanel.html` as an extension tab.

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
- WebDAV URLs configured as a sync backend, including attachment uploads when attachment sync is enabled.

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

Sync is disabled until a backend is selected. Language and lightweight preferences then use that backend. The provider sync option is enabled by default. Agents, skills, MCP servers, local execution bridges, chats, and chat attachments remain local unless the user enables their sync options.

Important: provider sync is enabled by default, so provider configurations may sync through browser sync. Users should treat synced provider API keys as sensitive browser-synced data.

Attachments are saved locally before optional WebDAV uploads finish. Upload completion retains local bytes, so disabling or changing sync cannot make a saved attachment unavailable, and a late upload cannot remove newer local contents under the same attachment ID. These retained copies consume local storage until explicit attachment or chat removal. Local save or tool completion does not confirm remote availability. Uploads are best effort and have no durable retry queue; closing the owning page can interrupt pending work. Attachments absent locally can still be read from the active remote backend.

Concurrent edits to different chats can merge. Within the same chat, the message array is a single merge value: simultaneous edits can select one version of that array. Sync does not currently merge each message independently across devices. Physical deletion of a remote document also does not prevent a later client write from recreating it.

## Stopping Work

Stop applies to the current chat. Subagent chats run independently and can be stopped individually. Closing a parent first asks the background to cancel the parent and linked child chat IDs, including retained runs that this panel has not visited since reload, and waits for acknowledgment before removing those chats. If cancellation cannot be acknowledged, the chats remain. Canceling a wait for a subagent result does not itself stop the child.

Cancellation propagates to owned requests that accept an abort signal, including foreground attachment reads and writes forwarded to the background. It cannot undo committed remote writes or browser actions already dispatched. Background sync operations without a caller abort signal can continue after a local save completes.

## Safe Use

- Broad permissions are necessary for cross-site browser assistance, but they increase responsibility for careful use.
- Attached pages and selected elements may contain sensitive information.
- Browser automation tools can navigate, click, type, close tabs, download files, interact with dialogs, and modify page state.
- Debugger-powered automation is available only when the selected agent has that capability enabled.
- MCP tools send arguments and context to configured MCP servers.
- Tool results and page content may be truncated by size limits.
