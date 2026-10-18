import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { chatContentKey } from "../src/shared/chat-keys.ts";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// A stored chat whose user messages carry every kind of context a message
// can be sent with: one tab, three tabs, files (one no longer stored),
// selected text and a selected element. Shared by the side panel test and
// before/after screenshots of the pills under the bubble.

export const SENT_CONTEXT_CHAT_ID = "sent-context-chat";

// A favicon in a loud brand-like colour, so a muted one shows.
const favicon = (color) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${color}"/></svg>`,
  )}`;

export const SENT_CONTEXT_TABS = [
  {
    path: "/sent-context/product",
    title: "Adjustable Laptop Stand, Aluminium Riser for 10–17 inch Notebooks",
    favicon: favicon("#ff9900"),
  },
  {
    path: "/sent-context/review",
    title: "Hands-on review: the best laptop stands this year",
    favicon: favicon("#1a73e8"),
  },
  {
    path: "/sent-context/forum",
    title: "Which laptop stand do you use? Community thread",
    favicon: favicon("#ff4500"),
  },
  {
    path: "/sent-context/specs",
    title: "Spec sheet",
    favicon: favicon("#00a650"),
  },
];

export const SENT_CONTEXT_PAGES = Object.fromEntries(
  SENT_CONTEXT_TABS.map((tab) => [
    tab.path,
    `<!doctype html><title>${tab.title}</title><link rel="icon" href="${tab.favicon}"><h1>${tab.title}</h1>`,
  ]),
);

// A 2×2 PNG.
const IMAGE_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwnyGBgSGBgeE/AwAfhAP9o6lQxQAAAABJRU5ErkJggg==";

export const SENT_CONTEXT_FILES = {
  image: {
    id: "sent-image",
    name: "desk-photo.png",
    type: "image/png",
    size: 75,
    kind: "image",
  },
  text: {
    id: "sent-notes",
    name: "measurements-and-notes.txt",
    type: "text/plain",
    size: 42,
    kind: "text",
  },
  missing: {
    id: "sent-missing",
    name: "warranty.pdf",
    type: "application/pdf",
    size: 120400,
    kind: "document",
  },
};

export const SENT_CONTEXT_TEXT =
  "The stand supports laptops up to 8 kg and folds flat for travel; the hinge is rated for 20,000 cycles.";
export const SENT_CONTEXT_ELEMENT = {
  success: true,
  ref: "sel-1",
  tagName: "button",
  innerText: "Add to cart",
};

// The prompts, one per user message, in order.
export const SENT_CONTEXT_PROMPTS = {
  oneTab: "Summarize this page",
  threeTabs: "Compare these stands",
  files: "Does my desk fit?",
  selection: "Is this true, and what does this button do?",
};

// `tabs`: the open tabs ({ id, title, url, favIconUrl }) in the order of
// SENT_CONTEXT_TABS.
function sentContextMessages(tabs) {
  const time = Date.UTC(2026, 9, 18, 9, 30);
  const user = (key, index, metadata) => ({
    id: `user-${key}`,
    role: "user",
    content: SENT_CONTEXT_PROMPTS[key],
    createdAt: time + index * 60000,
    metadata,
  });
  const reply = (key, index) => ({
    id: `assistant-${key}`,
    role: "assistant",
    content: "Done.",
    createdAt: time + index * 60000 + 1000,
    metadata: {
      runMetrics: {
        startedAt: time + index * 60000,
        endedAt: time + index * 60000 + 1000,
      },
    },
  });
  const files = Object.values(SENT_CONTEXT_FILES);
  return [
    user("oneTab", 0, { attachedTabs: [tabs[0]] }),
    reply("oneTab", 0),
    user("threeTabs", 1, { attachedTabs: tabs.slice(1, 4) }),
    reply("threeTabs", 1),
    user("files", 2, { uploadedAttachments: files }),
    reply("files", 2),
    user("selection", 3, {
      selectedTexts: [{ text: SENT_CONTEXT_TEXT, tabId: tabs[0].id }],
      selectedElements: [SENT_CONTEXT_ELEMENT],
    }),
    reply("selection", 3),
  ];
}

// Stores the chat and the files it still has (all but `missing`) from an
// extension page.
export async function seedSentContextChat(page, tabs) {
  const messages = sentContextMessages(tabs);
  const { image, text } = SENT_CONTEXT_FILES;
  await page.call(
    async ({ chatsKey, contentKey, chat, messages, records }) => {
      await chrome.storage.local.set({
        [chatsKey]: [chat],
        [contentKey]: { messages },
      });
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open("openbrowseragent-chat-attachments", 1);
        open.onupgradeneeded = () =>
          open.result.createObjectStore("attachments", { keyPath: "id" });
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("attachments", "readwrite");
        for (const record of records) {
          const bytes = record.base64
            ? Uint8Array.from(atob(record.base64), (c) => c.charCodeAt(0))
            : new TextEncoder().encode(record.text);
          transaction.objectStore("attachments").put({
            id: record.metadata.id,
            metadata: record.metadata,
            content: bytes,
          });
        }
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    {
      chatsKey: STORAGE_KEYS.chats,
      contentKey: chatContentKey(SENT_CONTEXT_CHAT_ID),
      chat: {
        id: SENT_CONTEXT_CHAT_ID,
        title: "Laptop stands",
        createdAt: messages[0].createdAt,
        updatedAt: messages.at(-1).createdAt,
        messageCount: messages.length,
        attachmentIds: Object.values(SENT_CONTEXT_FILES).map((file) => file.id),
      },
      messages,
      records: [
        { file: image, base64: IMAGE_DATA },
        { file: text, text: "Desk: 120 × 60 cm. Laptop: 14 inch, 1.4 kg." },
      ].map(({ file, ...content }) => ({
        ...content,
        metadata: {
          ...file,
          version: 1,
          chatId: SENT_CONTEXT_CHAT_ID,
          messageId: "user-files",
          createdAt: messages[0].createdAt,
        },
      })),
    },
  );
}

// Opens the fixture pages as tabs (from an extension page) and returns them
// as a message stores attached tabs.
export async function openSentContextTabs(page, url) {
  return page.call(
    async (tabs) => {
      const opened = [];
      for (const tab of tabs) {
        const created = await chrome.tabs.create({
          url: tab.url,
          active: false,
        });
        opened.push({
          id: created.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favicon,
        });
      }
      return opened;
    },
    SENT_CONTEXT_TABS.map((tab) => ({ ...tab, url: url(tab.path) })),
  );
}

// Opens the chat in the side panel, from the chat history.
export async function openSentContextChat(panel, historyLabel) {
  await poll(() =>
    panel.call(() => !!document.querySelector(".composer-box textarea")),
  );
  await clickElement(panel, `button[aria-label="${historyLabel}"]`);
  await clickElement(panel, ".history-select");
  await poll(() =>
    panel.call(
      (count) => document.querySelectorAll(".message.user").length === count,
      Object.keys(SENT_CONTEXT_PROMPTS).length,
    ),
  );
}
