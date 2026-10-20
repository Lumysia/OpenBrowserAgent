# Privacy Policy

Last updated: October 19, 2026

This policy covers the OpenBrowserAgent browser extension ("the extension"). The extension is open source; its code is at https://github.com/Lumysia/OpenBrowserAgent.

## Summary

The developer does not collect, receive, store, or sell any of your data. The extension has no account system, no server of its own, no analytics, and no advertising. What you type, the pages you share with it, and your settings stay in your browser, except where you send them to a service you configured yourself.

## Data the extension handles

To work, the extension handles:

- **Your messages and chats** with the agent.
- **Web page content** you share or that the agent reads for a task: page text, titles, URLs, selected elements, screenshots, and files you attach.
- **Text you select** and use with the quick actions on pages (for example to explain or translate it, or to look up a word), with the page title and some of the text around it.
- **The text of pages you translate**, and the subtitles of videos you translate: the video's own subtitle tracks, the caption files its player loads, or the captions it shows.
- **A tab's network requests and console messages**, only while the agent records them to debug a page for you (for example a login that fails). The recording stays in memory, ends with the agent's reply, and is discarded when the tab closes. Cookies, authorization headers, passwords, tokens and other credentials are removed before your model provider sees it.
- **What you do on a page while you record a task** to teach the agent (you start and stop it, and a "Recording" pill stays on the page): which buttons, links and fields you use, by what the page calls them, and the pages the tab goes to. What you type is not recorded (only which field and how long the entry was), passwords, codes and card numbers are never kept, and an entry is kept as an example only when you tick it. The steps go to your AI provider once to write a skill and are saved with it.
- **Scheduled tasks and page watches** you set up: their instructions, schedule and the address of a watched page. To notice a change, a watch keeps a fingerprint (hash) and a limited copy of the watched text in your browser; the agent and your AI provider get the text only when it changed.
- **Browsing activity needed for a task**: the list of open tabs, and the pages the agent opens, reads, or interacts with.
- **Settings and credentials** you enter: AI provider settings and API keys, agents, skills, MCP server settings, sync settings, and local execution bridge settings.

## Where the data goes

The extension stores this data in your browser's local extension storage.

It sends data only to services you configure and turn on:

- **AI providers** you add: cloud services or model servers on your own computer or network. They receive your messages, chat history, and the page content, selected text and tool results needed to answer. Their own privacy policies apply. Before a provider on another server receives any of your content for the first time, the extension names the server it would go to (for example api.openai.com) and asks for your permission: when you add the provider, or before your first message to it. Nothing is sent to it until you agree. The permission is stored with the provider (and synced with it when sync is on) and applies only to that server; if you change the provider's address to another server, you are asked again. Providers on your own device or local network (such as localhost or a private network address) need no permission.
- **MCP servers** you add or turn on, including any recommended ones you choose to add. They receive the tool requests the agent sends them, such as search queries.
- **Sync storage**, if you turn sync on: your browser account's sync storage, or a WebDAV server you choose. It receives your settings (preferences, AI providers and MCP servers without their keys, agents and their notes, skills, scheduled tasks) and the groups you turn on: keys, chats and files. API keys and MCP request headers are encrypted on your device with your sync passphrase before they are sent, so the sync storage cannot read them. Local execution bridges are never synced.
- **Your browser's default search engine**, when the agent searches the web through it.
- **A local execution bridge**, only if you install one on your computer and enable it.
- **The translation engine you select** for page and subtitle translation (see below).

The extension also fetches web pages, images, and link previews that you or the agent open as part of a task, and, when you translate a video's subtitles, the caption files its player loaded.

When the agent runs code it wrote (for example, to add up a table), the code runs on your device in a sandboxed interpreter that ships with the extension. It cannot reach the internet, web pages, or the extension's data; it only gets the input and the agent workspace files the agent passes to it, and files it writes are saved to that agent's workspace. Its result goes to your model provider like any other tool result.

## Translation engines

OpenBrowserAgent translates pages and video subtitles with the engine you select in the extension's settings. Nothing is translated until you ask for a page or a video to be translated, or turn on automatic subtitle translation, which translates the subtitles of the videos you watch. Video subtitles go to the same engine as page text.

- **Your browser's built-in translator**: your browser translates on your device, and no text leaves your browser. It is offered only in browsers that have one. Text it can't translate stays as it is, with a note on the page; it is never handed to another engine.
- **AI model**: the page's text and title, or the subtitle lines, are sent only to the model provider you configured.
- **Google Translate (free)** or **Microsoft Translator (free)**: the text being translated (not the page address, your cookies or account data) is sent directly from your browser to Google or Microsoft to get the translation. These free engines use public web-translation endpoints that are not official APIs; they are not operated by or affiliated with OpenBrowserAgent, may limit or stop working at any time, and process the text under their own privacy policies ([Google](https://policies.google.com/privacy), [Microsoft](https://privacy.microsoft.com/privacystatement)). If the selected one limits or refuses requests or stops responding while a page is being translated, the rest of that page is translated with the other one (the page says so), so its text can reach both companies. Do not use them on pages with information you are not willing to share with Google and Microsoft.

Translations are saved in your browser for a limited time, so pages you translated before come back at once. You can clear them in the extension's settings.

## What the developer does not do

- No data is sent to the developer or to any server operated by the developer.
- No data is sold or transferred to third parties, except to the services you configure as described above.
- No data is used or transferred for purposes unrelated to the extension's single purpose (an AI agent that helps you with tasks in your browser).
- No data is used or transferred to determine creditworthiness or for lending purposes.
- No data is used for advertising.

The use of information received from Google APIs complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## Your control

- Delete chats, agents, skills, and settings in the extension at any time. Uninstalling the extension removes its local storage.
- Sync is off until you choose a sync backend, and you choose what to sync.
- Withdraw a provider's permission in the extension's settings; it then receives nothing until you agree again.
- Remove a provider, MCP server, or sync backend to stop sending data to it.

More detail on each browser permission and on what is sent where: [Permissions and Privacy](docs/permissions-and-privacy.md) and [Sync](docs/sync.md).

## Children

The extension is not directed at children under 13.

## Changes

Changes to this policy are published in this file, and its history is visible in the repository.

## Contact

Questions or concerns: open an issue at https://github.com/Lumysia/OpenBrowserAgent/issues.
