# Changelog

What changed in each release. The release workflow publishes the section for the tag's version as the start of the GitHub release notes, followed by the list of merged pull requests.

## Unreleased

- **Setup on install**: installing OpenBrowserAgent opens a setup page where you add an AI provider first. The side panel's setup card is shorter too: add an AI provider, or follow "Already use OpenBrowserAgent on another device? Paste a sync code". The language step (the interface already follows your browser's language) and the "Send your first task" step are gone.
- Live chat and bullet comments flying over a video are no longer translated as its subtitles. Subtitles that start by themselves now only use the subtitles a video or its player provides; for captions a player only draws on the video, start them from "Translate subtitles" in the video's right-click menu.

## 0.2.0-beta.11 - 2026-10-15

- **Translate video subtitles everywhere**: turn on "Translate video subtitles" in Settings → Page translation, and every video with subtitles shows each line with its translation under it by itself, on any site, including the first captions a player loads (no need to turn the player's captions off and on again). "Translate subtitles" in a video's right-click menu turns them off or on for that video. The switch is off by default; while it is off, the menu and "Translate this page" translate subtitles as before.
- The small subtitle button on the corner of videos is gone, with its setting; the switch above and the right-click menu replace it.
- Translated subtitles stay over the video when the window or the player changes size, also while the video is paused, and move with it when you scroll instead of catching up a moment later; before, they could hang past the player's edge or below it. They are also smaller, with the original line a little smaller than its translation.
- Subtitles of players embedded from another site, and of caption files a site serves as plain files (without saying they are subtitles), are translated too. A player's preview pictures over the seek bar and annotations such as a site's watermark are no longer taken for subtitle lines; ruby readings over words are left out of the line.
- Page translation translates more of the page's content: questions and sentences in buttons, tabs and quiz choices, dialogs (also cookie and sign-in prompts), headings and text in a page's header and footer, tables of contents, columns fixed beside the article, link titles written in title case, titles with a number such as "Ep 12: The End", boxed lists of headlines, and carousel slides once they show. A button inside a sentence stays in it, so the sentence is translated whole. Short labels such as menu items, "Log in" and "Accept", names, dates and prices still stay as they are unless you turn on translating menus and buttons.
- A question the assistant asks in the side panel can always be answered while it waits, also after a step that failed; writing in the message box instead sends your message as the reply. A question nothing waits for any more (the response was stopped or ended) shows as not answered, instead of "Asking a question" with options you couldn't click.

## 0.2.0-beta.10 - 2026-10-15

- **Translate button on pages**: a small button on the edge of web pages translates the page or shows the original. Drag it to any edge of the window; it stays where you put it on every site. Point at it to hide it on that site or everywhere; Settings → Page translation lists the sites it is hidden on.
- **Keyboard shortcut for page translation**: Alt+A (Control+Shift+A on macOS) translates the page or shows the original. Change it in the browser's shortcut settings, or turn it off in Settings → Page translation.
- Translate in the smart bar now writes a word's dictionary entry in your language every time (in English when the word is already in your language); before, the first try often came back in the page's language.
- Removed the "Diagnostic logging" switch in Settings → Debug: it no longer did anything. Its stored setting is cleared on update.
- Links you open in a new tab from a translated page are translated too, like the next pages in the same tab.
- The browser's built-in translator leaves text that is already in your language as it is, also on pages that mix languages (such as a feed with posts in several languages); before, it could garble it.
- With the browser's built-in translator, short titles such as a name with a version number are translated like the rest of the page. Before, one it took for another language could stop it from translating the page and hand it to the AI model, or leave the titles and the cards after them untranslated. A text in a language it can't translate no longer takes the texts around it down with it.
- A teaser that ends in a "Read more" the page sets on a line of its own gets its translation right under the teaser, and "Read more" its own; before, the translation came after "Read more" and repeated it.
- Page translation translates buttons that hold the page's content, such as the questions of an FAQ and the titles of sections that open and close, with the translation under the title inside the button. Short buttons such as "Log in" still stay as they are unless you turn on translating menus and buttons.
- An MCP server or bridge test error saved by an earlier version no longer repeats "Server test failed" or "Bridge test failed" in front of the reason.
- Skills you picked are highlighted in the skill list, like the chosen model and agent.
- When a page the agent works on opens a new tab, your tab now always comes back to the front; before, it sometimes stayed on the new tab.
- A download's progress in the side panel shows its percentage the way the extension's language writes it (such as "42 %" in German and French).
- A model that refused images or mid-chat tool updates once is sent requests without them from the start in later chats, instead of failing first each time; editing the model in Settings lets it try again.
- Loading the model list of an Anthropic or Gemini provider now shows all of its models, not only the first page.

## 0.2.0-beta.9 - 2026-10-14

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
- Local commands run for as long as the execution bridge's timeout says (2 minutes unless you change it, at most 30), and the agent is told that same limit; before, the agent was told 10 minutes while the bridge stopped commands earlier. Update the bridge (`npx openbrowseragent-local-execution-bridge@1 update`) so a failed bridge test names the exact setup step to fix.
- The extension starts in your browser's language when it supports it: a browser set to French, German, Japanese, Spanish, Portuguese, Korean or Chinese (Hong Kong, Macao, Singapore) no longer gets English, and the settings show the language in use.
- **Recommended MCP servers**: the keyless search servers (Exa, Parallel, TinyFish, Firecrawl) are now a list of recommended servers that you add with one click, instead of being in every list. The ones you already have stay, and every MCP server can now be deleted; a deleted recommended server is offered again.
- Sources from MCP tools work with any server: they come from the links a server marks as results (resource links, structured results, or a link on its own line) instead of one search server's text format.
- Saving a page's images finds CSS background images on any element (not only common containers) and takes the image the browser chose from `srcset`; images keep their real file extension.
- Files of any text type (code, logs, `+json`/`+xml` formats) are read and attached as text.
- Bridge test errors the extension knows (bridge not found, no host name, no answer in time) are shown in your language.
- Page translation with your AI model reads each part of the page in context: the model is told the page's description, the section heading above the text, the sentence just before it and whether a text is a heading, button, menu item, label or caption. Short labels and buttons come out shorter and more natural, and smaller models translate more cleanly (fewer untranslated or repeated originals). Translations cached by earlier versions are made again once.
- Model names containing “/” (such as OpenRouter’s `vendor/model`) show whole in the model menus, every model picker in Settings shows models the same way, and the model named under an answer is the one that actually answered.
- “Reset built-ins” and “Reset defaults” on the Agents page ask for confirmation first, like deleting a skill.
- "Fetch models" in Settings asks for permission to send to a provider's server first, like "Test model", since the request carries your API key. Gemini's key is sent in a header instead of the address.
- Settings and the side panel tell the browser their language, so screen readers and hyphenation follow the UI language.
- Sync backends on the Sync page show the name you gave a WebDAV backend and a line on what each kind of sync is, instead of the same title twice. First-run setup names the WebDAV option in your language and saves the server details only when you connect.
- Settings text fields for agents, MCP servers and local execution bridges save when you leave the field instead of on every keystroke, and deleting an MCP server or bridge asks first. Test errors and import errors show in your UI language, also after you change it.
- “Test model” in AI provider settings sends its request the same way chats do (so it checks the connection chats actually use), asks for permission like other requests, and shows a check mark when it passes.
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
