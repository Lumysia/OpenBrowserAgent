# Sync

OpenBrowserAgent can keep settings and data the same on several browsers. Sync is off until you pick a backend on the Sync settings page:

- **Browser account sync** uses the sync storage of the browser account you are signed in to. It is small (about 100 KB in Chrome), so it carries settings, providers, agents, skills, MCP servers and local execution bridges, but not chats or attachments.
- **WebDAV** uses a folder on any WebDAV server (Nextcloud, Koofr, InfiniCLOUD, a NAS, …). It carries everything, including chats and chat attachments.

Language, preferences and the sync settings themselves always sync. Each other category has its own switch; providers are on by default.

## What is stored on the server

A WebDAV folder holds:

```
root.json.gz           the list of synced items, the only file that is ever overwritten
blobs/<x>/<hash>.gz    larger content: chat messages, skill and workspace files, attachments
```

The root file lists every synced item with a timestamp. Small items (a preference, a provider, an agent, a chat's title) are stored in it directly. Larger content is stored once in `blobs/`, under a name that is the SHA-256 hash of the content, and never changed afterwards. Everything is stored as plain gzip-compressed JSON (attachments as their bytes), not encrypted, so treat the folder like the data in it: it contains provider API keys when provider sync is on.

Browser account sync stores the same items, one per storage entry, with large items split into parts under the 8 KB entry limit.

## When it syncs

All syncing runs in the extension's background, shared by every open page:

- when the browser starts, and when an extension page (the side panel, the settings page) opens or gets focus;
- a few seconds after you change something;
- once a minute while an extension page is visible;
- never on a timer while no extension page is open. The next time you open one, it catches up.

When nothing changed, a check is a single small request that the server answers with "not modified". With a page open all the time that is about 60 requests an hour per browser. Browser account sync is told about changes by the browser and makes no requests of its own.

If the server answers "too many requests" (HTTP 429) or "temporarily unavailable" (503), all sync pauses: first for a minute, then doubling up to an hour, or as long as the server asks. The Sync page shows until when.

## Changes on several devices

- Each item carries a timestamp from a hybrid clock. When two devices change the same item, the newer change wins. A browser restored from an old backup cannot overwrite newer data with its old copy.
- Deletions are recorded as deletions. A file missing on the server never deletes anything on your devices; if the server lost data, the devices that still have it upload it again.
- When two devices add messages to the same chat at the same time, both keep all messages, in time order.
- When two devices edit the same skill or workspace file, the newer edit keeps the file name and the other is kept next to it as `name.conflict-<device>-<date>.ext`.
- Chats are downloaded on a device only when you open them there. Attachments are downloaded when a chat shows them.
- If a sync would delete more than half of a list with more than five items (for example, most of your chats), it pauses and asks on the Sync page whether to delete them on this device or keep them and upload them again.
- A device that joins an existing sync takes the account's settings and keeps its own chats and other items, which are uploaded.

## Server requirements

WebDAV writes the root file only if it is still the version the device read (`If-Match` with the file's ETag). If two devices write at once, the later one reads the new version, merges, and tries again. This needs a server that sends strong ETags. When connecting, OpenBrowserAgent checks the server with a small test file that it deletes again:

- If the server's file versions are unreliable (missing or weak ETags, or a server that rejects its own ETags), this device stops uploading and the Sync page says so; it keeps downloading changes from other devices.
- If the server accepts uploads whatever `If-Match` says (Koofr did in October 2026), two devices saving at the same moment can overwrite each other's root file. The Sync page warns about it. Nothing is lost: the device whose change was overwritten notices at its next check that the server is behind and uploads the change again.

## Status

The Sync settings page shows the last successful sync, the number of changes waiting to upload, a pause with its reason, and warnings about the server. **Sync now** runs a check at once.

## Testing

`npm test` covers the merge rules, clocks, root validation, the mass-delete guard and browser sync item limits. Against a real WebDAV server (for example WsgiDAV), `npm run test:sync:webdav -- <urlA> <urlB>` runs two simulated devices through the cases that matter most; the two URLs should reach the same folder through different host names. `node scripts/sync-mutations.mjs` breaks each safety guard on purpose and checks that a test fails.
