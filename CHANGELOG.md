# Changelog

What changed in each release. The release workflow publishes the section for the tag's version as the start of the GitHub release notes, followed by the list of merged pull requests.

## Unreleased

- **Translated video subtitles**: choose "Translate subtitles" in a video's right-click menu or press the small button on its corner, and its subtitles show the original line with its translation under it, also in fullscreen; "Translate this page" translates the subtitles of the page's videos too. It works with the video's own subtitle tracks, the caption files a player loads and captions a player draws on the video, on any site.
- **Sync in groups**: settings always sync, including AI providers, agents (with their `MEMORY.md` and `USER.md`), MCP servers and skills. Keys, chats and files each have one switch. Files (skill files, other workspace files, chat attachments) sync on WebDAV only; where they don't sync, agents and skills say so instead of looking empty. Local execution bridges no longer sync.
- **Encrypted API keys**: API keys and MCP request headers sync only when you turn on keys and set a sync passphrase. They are encrypted on your device; every other device asks for the passphrase once.
- **Set sync up again after updating**: the sync format changed. The first sync replaces the old data on the server with this device's; check the Sync page to turn keys, chats and files on again. Your data on each device stays as it is. Update all devices: older versions stop syncing with the new format.
- **Recovery from a broken sync file**: if an upload stops halfway and leaves the server's sync file empty or damaged, the next sync rebuilds it from the previous copy and your devices' data, and shows a note, instead of failing every time. Two devices saving at the same moment on a server that locks files during uploads (such as Koofr) no longer fail with "Locked".
- Skills are limited to 96,000 characters of files, like an agent's workspace.

- The side panel has one background from top to bottom; the line and the separate band behind the message box are gone.
- The send button no longer flickers when the pointer moves over it.
- After "Translate this page", the next pages you open in the same tab are translated too, on any site, until you reload the tab or choose "Show original".
- **Page translation uses the browser's on-device translator by default**: it is fast and keeps the text on your device. Where the browser has none (Firefox, Safari, older Chrome) or can't translate a page's language, the page is translated with your AI model instead and a note says so. If you have changed settings before, your page translation engine may stay as it was; choose "Built-in translator" in Settings → Page translation to use it.
- A response that ends early now says so under it: cut off at the model's output limit, stopped, or the error it ended with (shown once, no longer next to a second copy of the response), with a Continue button on the latest one. The chat export includes how each response ended, the model is told when an earlier response was cut off, stopped responses keep their token usage, and model calls no longer count the earlier messages of the chat. Models Pi knows get their full output limit.
- Page translation covers more of the page: with the browser's built-in translator, a text it refuses no longer leaves the rest of its group untranslated (such as a list of links under a heading); headings and paragraphs on sites with tightly set type show their translation under them instead of only on hover; headings that animate word by word are translated once, not twice; and headings and paragraphs that some sites wrap in layout-less elements are no longer skipped.
- Page translation with your AI model reads each part of the page in context: the model is told the page's description, the section heading above the text, the sentence just before it and whether a text is a heading, button, menu item, label or caption. Short labels and buttons come out shorter and more natural, and smaller models translate more cleanly (fewer untranslated or repeated originals). Translations cached by earlier versions are made again once.
- Model names containing “/” (such as OpenRouter’s `vendor/model`) show whole in the model menus, every model picker in Settings shows models the same way, and the model named under an answer is the one that actually answered.
- “Reset built-ins” and “Reset defaults” on the Agents and MCP servers pages ask for confirmation first, like deleting a skill.
- Settings and the side panel tell the browser their language, so screen readers and hyphenation follow the UI language.
- Sync backends on the Sync page show the name you gave a WebDAV backend and a line on what each kind of sync is, instead of the same title twice. First-run setup names the WebDAV option in your language and saves the server details only when you connect.
- Settings text fields for agents, MCP servers and local execution bridges save when you leave the field instead of on every keystroke, and deleting an MCP server or bridge asks first. Test errors and import errors show in your UI language, also after you change it.
- Mermaid diagrams in answers are drawn in the side panel instead of by mermaid.ink, so diagram text no longer leaves your device; they follow the theme, and a diagram that can't be drawn shows its source.

## 0.2.0-beta.8 - 2026-10-14

An eighth pre-release of 0.2.0.

- **Faster dictionary, smart bar and page translation with thinking models**: quick requests ask for the least thinking the model supports (taken from the model catalog, or a new per-provider "thinking switch" for OpenAI-compatible servers). If a model still thinks, the smart bar says "Thinking…" instead of staying blank. On a local server, page translation sends one batch at a time and smart bar requests go first.
- **Run code**: the agent can run JavaScript in a sandbox (QuickJS) to compute, parse CSV or JSON and transform data. The sandbox has no network, no page access and no extension APIs, with time, memory and output limits.
- **Page translation and the smart bar follow general rules only**: code views, cookie notices, icons, rich editors and labels are recognised from page structure rather than from particular websites' names, and rules no longer assume English text. The smart bar is no longer blocked on one site by default; it simply stays hidden when nothing on the page can be selected.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.7 - 2026-10-14

A seventh pre-release of 0.2.0.

- **Page translation that keeps the page tidy**: menus, tabs, buttons, dates, names and icons stay as they are; each translation goes where it reads well (under the paragraph, after a short label, or on hover only where showing it would break the layout); news headlines show their translation under them; translations line up with the original and use its font. "Translation only" swaps the text in place. On-screen text is translated first, and the AI model keeps names consistent across a page. A first click on "Translate this page" now always starts.
- **The agent stays on its own tab**: what it opens and works in doesn't take over the tab you are reading.
- **Ask before sending to a remote AI provider**: the first time content goes to a provider's server, you are asked once per address (local and LAN addresses never ask); you can withdraw it in Settings.
- **Calmer auto-scroll**: scrolling up a little while an answer streams stops following, and the end of the answer no longer pulls you down.
- **Clearer names**: "AI provider" throughout, and every API type reads "…-compatible" (Gemini, Ollama, OpenAI Responses too). The sync section now says which settings always sync.
- Page notes such as "Copied as Markdown" use the extension's own look.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.6 - 2026-10-14

A sixth pre-release of 0.2.0.

- **Translate whole pages**: "Translate this page" in the right-click menu shows the translation under each paragraph (or only the translation) and "Show original" restores the page. Engines: your AI model, Chrome's built-in translator, or Google or Microsoft (free). Settings → Page translation.
- **Downloads**: the agent can download files (also ones that need you to be logged in), save what it made to your device, wait for a download a click starts, and tells you where each file is. Each file has a "show in folder" button.
- **Everything in your language**: tool steps read as plain summaries ("typed 2 fields, clicked 1"); errors, sizes, counts, dates and default names follow the interface language.
- **Clearer tool results for the agent**: it reads long pages with extract instead of twice, cites sources by the right ids, and gets exact counts and receipts from find, workspace, skills and devtools.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.5 - 2026-10-14

A fifth pre-release of 0.2.0.

- A right-click menu: ask about or act on the page, summarize it, search the web about it or about the selected text, summarize a linked page, or copy the page as Markdown. Each item can be turned off in Settings → Right-click menu.
- The smart bar's Summarize is replaced by AI search, which asks the agent in the side panel to search the web about the selection.
- Text sent to the side panel from a selection shows as a card next to the page, not as a quote in the message box.
- Read aloud reads each part in its own language, with a matching voice.
- Interface text can no longer be selected by accident; messages and other content still can.
- The smart bar's close menu no longer highlights its first item when opened with the pointer.
- Theme flag swatches show their tooltip on hover again.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.4 - 2026-10-14

A fourth pre-release of 0.2.0.

- Smart bar icons no longer jump by a pixel when the bar opens under the pointer. They still highlight on hover.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.3 - 2026-10-14

A third pre-release of 0.2.0.

- **Dictionary on Translate**: translating a single word or a short phrase now shows a dictionary entry instead of a one-line translation. It has the pronunciation, part of speech, the meaning on this page first, other meanings, examples with translations, and synonyms or collocations. It works in every UI language and uses the model you already set for the smart bar. Explain and longer selections are unchanged.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.2 - 2026-10-13

A second pre-release of 0.2.0.

- Holiday badges and confetti now follow your theme color instead of using the same color in every theme.
- Built-in MCP servers (Exa, Parallel, TinyFish, Firecrawl) can be turned off but no longer show a Delete button. Deleting one only brought it back and made another server look expanded.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on.

## 0.2.0-beta.1 - 2026-10-13

A pre-release of 0.2.0, for testing before it goes to the Chrome Web Store.

- **New look**: the stylesheets are rewritten on one set of design tokens. Floating panels share one shadow scale, so the smart bar has a proper shadow again, and every earlier animation is still there.
- **Pride themes**: rainbow, trans, lesbian, bi, pan, nonbinary and ace, under General settings. Their soft colors come from each flag.
- **Holiday touches** on well-known days. They use only your device's date, and you can turn them off in settings.
- Counts now use the right plural form in every language.

To install, unzip the Chrome package and load it from `chrome://extensions` with Developer mode on. Firefox and Safari builds are still experimental.

## 0.1.0 - 2026-10-13

First public release of OpenBrowserAgent: an AI side panel that reads pages, does research, and works through browser tasks with you, using your own model providers.

**Status:** Chrome and other Chromium-based browsers (Edge, Brave, Arc) are the supported target. The Firefox and Safari builds are experimental. They build and pass the shared tests, but they have not been tested on real browsers yet.

### Install

- **Chrome / Chromium:** unzip `open-browser-agent-0.1.0-chrome.zip`, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the unzipped folder. A Chrome Web Store listing is on the way.
- **Firefox (experimental):** `open-browser-agent-0.1.0-firefox.zip`. Load it as a temporary add-on from `about:debugging`.
- **Safari (experimental):** `open-browser-agent-0.1.0-safari.zip`. It needs Xcode's Safari web extension converter.
- `open-browser-agent-0.1.0-sources.zip` is the source package for store review.

### Highlights

- **Side panel agents**: Browse and Ask presets, plus custom agents with their own instructions, tools, model and workspace. Sub-agents run in the background.
- **Page tools**: compact page snapshots, find, read, extract with a helper model, act (click, type, select, drag, real input where pages need it), in-place page edits, screenshots, downloads, tab management and tab groups.
- **Web search**: through the browser's default search engine, or through built-in keyless MCP search servers (Exa, Parallel, TinyFish, Firecrawl; off until you turn one on, since each sends queries to a third party). Answers cite their sources.
- **Skills**: built-in skills (fill forms, tidy tabs, help with OpenBrowserAgent, create skills). You can also customize skills, import and export skill packages, or let the agent pick a skill when a request fits.
- **MCP servers**: remote Streamable HTTP servers, with connection testing, per-tool switches, and a per-server option to send requests without the browser `Origin` header.
- **Sync** across devices through WebDAV or browser account sync:
  - per-item merge, so edits on two devices don't overwrite each other;
  - deletions sync safely, and a mass delete asks you first;
  - optional sync of chats and attachments.
  - See [docs/sync.md](https://github.com/Lumysia/OpenBrowserAgent/blob/main/docs/sync.md).
- **Smart bar** for selected text and editable fields: explain, translate, improve wording, read aloud. It is off by default; once on, it can be limited per site.
- **Local execution bridge** (optional): lets an agent run commands on your computer.
- **UI**: 9 interface languages, light and dark themes, and accent colours.

### Good to know

- You bring your own model provider and API key. Nothing is sent anywhere except the providers, MCP servers and sync servers you configure. See [Permissions and privacy](https://github.com/Lumysia/OpenBrowserAgent/blob/main/docs/permissions-and-privacy.md).
- Sync was tested with Koofr WebDAV and a local WebDAV server, on two devices. Other WebDAV services should work if they send strong ETags; the Sync page tells you if a server is not suitable.
- Export important chats before turning on sync for the first time.
- From this release on, updates keep your stored and synced data. Format changes will come with a migration.

Please report problems on the [issue tracker](https://github.com/Lumysia/OpenBrowserAgent/issues).
