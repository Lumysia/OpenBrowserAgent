import assert from "node:assert/strict";
import test from "node:test";
import {
  readLocalChatContent,
  saveChatContent,
} from "../src/shared/chat-storage";
import {
  normalizeChatContent,
  normalizeChatSummaries,
} from "../src/shared/chats";
import { normalizeMcpServers } from "../src/shared/mcp";
import { normalizeSkills } from "../src/shared/skills";
import { storage, updateById } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { keepStoredForm } from "../src/shared/stored-form";
import type {
  AgentWorkspace,
  ChatContent,
  ChatSummary,
} from "../src/shared/types";
import { normalizeWorkspaces } from "../src/shared/workspace";
import { onDevice, userMessage } from "./sync-app-fixture";
import { ALL_ON, device, memoryServer, memoryTransport } from "./sync-fixtures";

// Stored items whose id reading makes up (no id) or changes (a path reading
// normalizes) are the same items as the ones reading shows: a save keeps
// them, and an edit or delete of one applies to it.

// What storage.update() does: read, updater, normalize, keepStoredForm.
function update<T>(
  stored: unknown,
  normalize: (value: unknown) => T,
  change: (value: T) => T,
) {
  const current = normalize(stored);
  return keepStoredForm(stored, current, normalize(change(current)));
}

const newDevice = () =>
  device("deviceB", memoryTransport(memoryServer()), { now: 1e9 }, ALL_ON);

test("review8 K1: a stored MCP server without id survives an unrelated save", () => {
  const stored = [
    { id: "mcp_a", name: "A", url: "https://a.example/mcp", createdAt: 1 },
    { name: "No id", url: "https://noid.example/mcp", createdAt: 1 },
  ];
  const result = update(stored, normalizeMcpServers, (list) =>
    list.map((s) => (s.id === "mcp_a" ? { ...s, name: "A2" } : s)),
  ) as Array<{ url: string }>;
  assert.deepEqual(
    result.map((server) => server.url),
    ["https://a.example/mcp", "https://noid.example/mcp"],
  );
  assert.deepEqual(result[1], stored[1], "left alone: stored as it was");
});

const skillFile = {
  path: "SKILL.md",
  content: "---\nname: x\n---\nbody",
  updatedAt: 1,
};
const idlessSkills = [
  {
    id: "s1",
    name: "one",
    description: "d",
    files: [skillFile],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    name: "two",
    description: "d",
    files: [skillFile],
    createdAt: 1,
    updatedAt: 1,
  },
];

test("review8 K1: a stored skill without id survives an unrelated save", () => {
  const result = update(idlessSkills, normalizeSkills, (list) =>
    list.map((s) => (s.id === "s1" ? { ...s, description: "edited" } : s)),
  ) as Array<{ name: string }>;
  assert.deepEqual(
    result.map((skill) => skill.name),
    ["one", "two"],
  );
  assert.deepEqual(result[1], idlessSkills[1]);
});

test("review8 K1: editing or deleting a skill without id applies to it, and it keeps its id", () => {
  const shown = normalizeSkills(idlessSkills);
  const id = shown[1].id;
  const edited = normalizeSkills(
    update(idlessSkills, normalizeSkills, (list) =>
      list.map((s) => (s.id === id ? { ...s, description: "new" } : s)),
    ),
  );
  assert.deepEqual(
    edited.map((skill) => [skill.id, skill.description]),
    [
      ["s1", "d"],
      [id, "new"],
    ],
  );
  const deleted = update(idlessSkills, normalizeSkills, (list) =>
    list.filter((s) => s.id !== id),
  );
  assert.deepEqual(deleted, [idlessSkills[0]]);
});

test("review8 K1: reading makes up the same ids for the same data", () => {
  const servers = [
    { name: "x", url: "https://x" },
    { name: "x", url: "https://x" },
  ];
  const ids = () => normalizeMcpServers(servers).map((server) => server.id);
  assert.deepEqual(ids(), ids());
  assert.equal(new Set(ids()).size, ids().length, "equal items differ");
  assert.deepEqual(
    normalizeSkills(idlessSkills),
    normalizeSkills(idlessSkills),
  );
  const chat = {
    messages: [
      { role: "user", content: "q", createdAt: 1, parts: [{ type: "text" }] },
    ],
  };
  assert.deepEqual(normalizeChatContent(chat), normalizeChatContent(chat));
  const summaries = [{ title: "t", createdAt: 1, updatedAt: 1 }];
  assert.deepEqual(
    normalizeChatSummaries(summaries),
    normalizeChatSummaries(summaries),
  );
});

const workspaceFile = (path: string, content: string) => ({
  path,
  content,
  kind: "markdown",
  updatedAt: 1,
});
const workspace = (files: ReturnType<typeof workspaceFile>[]) => [
  { agentId: "ag", files, createdAt: 1, updatedAt: 1 },
];
const readWorkspaces = (value: unknown) =>
  normalizeWorkspaces(value as AgentWorkspace[]);
const editA = (list: AgentWorkspace[]) =>
  list.map((w) => ({
    ...w,
    files: w.files.map((f) =>
      f.path === "notes/a.md" ? { ...f, content: "new", updatedAt: 2 } : f,
    ),
  }));
const contentOfA = (stored: unknown) =>
  readWorkspaces(stored)[0].files.find((f) => f.path === "notes/a.md")?.content;

test("review8 K1: editing a workspace file whose stored path reading normalizes keeps the edit", () => {
  for (const files of [
    [workspaceFile("b.md", "b"), workspaceFile("notes\\a.md", "old")],
    // A stored file that sorts after it comes first in storage.
    [workspaceFile("z.md", "z"), workspaceFile("notes\\a.md", "old")],
  ]) {
    const stored = workspace(files);
    const written = update(stored, readWorkspaces, editA);
    assert.equal(contentOfA(written), "new");
    assert.equal(
      (written as AgentWorkspace[])[0].files.length,
      2,
      "no stale copy",
    );
  }
});

test("review8 K1: deleting a workspace file whose stored path reading normalizes deletes it", () => {
  const stored = workspace([
    workspaceFile("b.md", "b"),
    workspaceFile("notes\\a.md", "old"),
  ]);
  const written = update(stored, readWorkspaces, (list) =>
    list.map((w) => ({
      ...w,
      files: w.files.filter((f) => f.path !== "notes/a.md"),
    })),
  );
  assert.equal(contentOfA(written), undefined);
  assert.deepEqual(written, workspace([workspaceFile("b.md", "b")]));
});

test("review8 K1: a chat summary without id survives an unrelated list update", async () => {
  const b = newDevice();
  const summaries = [
    { id: "c1", title: "one", createdAt: 1, updatedAt: 1, messageCount: 0 },
    { title: "no id", createdAt: 2, updatedAt: 2, messageCount: 0 },
  ];
  b.seed(STORAGE_KEYS.chats, summaries);
  await onDevice(b, () =>
    updateById(storage.chats, "c1", (chat) => ({ ...chat, title: "renamed" })),
  );
  const stored = b.get<ChatSummary[]>(STORAGE_KEYS.chats);
  assert.deepEqual(
    stored.map((chat) => chat.title),
    ["renamed", "no id"],
  );
  assert.deepEqual(stored[1], summaries[1]);
});

const KEY = `${STORAGE_KEYS.chats}/X`;
const idlessMessages = [
  { role: "user", content: "first question", createdAt: 1 },
  { role: "assistant", content: "first answer", createdAt: 2 },
];

for (const withBase of [true, false])
  test(`review8 K2: a chat whose stored messages have no id keeps them when a message is added (${withBase ? "page save" : "no base"})`, async () => {
    const b = newDevice();
    b.seed(KEY, { messages: idlessMessages });
    let returned: ChatContent | undefined;
    let loaded: ChatContent | undefined;
    await onDevice(b, async () => {
      loaded = (await readLocalChatContent("X"))!;
      const page = { messages: [...loaded.messages, userMessage("u3", 3)] };
      ({ content: returned } = await saveChatContent(
        "X",
        page,
        withBase ? loaded : undefined,
      ));
    });
    const stored = b.get<ChatContent>(KEY).messages;
    assert.deepEqual(stored.slice(0, 2), idlessMessages, "as stored");
    assert.equal(stored[2].id, "u3");
    // The save returns the ids the page had: they are the ids reading gives.
    assert.deepEqual(
      returned!.messages.map((message) => message.id),
      [...loaded!.messages.map((message) => message.id), "u3"],
    );
  });

const idlessParts = [
  { type: "reasoning", text: "thinking" },
  { type: "text", text: "answer" },
];

test("review8 K2: message parts without id stay when the page adds a message or edits that message", async () => {
  const b = newDevice();
  const stored = {
    messages: [
      {
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 1,
        parts: idlessParts,
      },
    ],
  };
  b.seed(KEY, stored);
  await onDevice(b, async () => {
    const loaded = (await readLocalChatContent("X"))!;
    const page = { messages: [...loaded.messages, userMessage("u2", 2)] };
    await saveChatContent("X", page, loaded);
  });
  assert.deepEqual(b.get<ChatContent>(KEY).messages[0], stored.messages[0]);
  await onDevice(b, async () => {
    const loaded = (await readLocalChatContent("X"))!;
    const [first, ...rest] = loaded.messages;
    const parts = first.parts!.map((part) =>
      part.type === "text" ? { ...part, text: "edited" } : part,
    );
    await saveChatContent(
      "X",
      { messages: [{ ...first, parts }, ...rest] },
      loaded,
    );
  });
  const parts = b.get<ChatContent>(KEY).messages[0].parts!;
  assert.deepEqual(
    parts.map((part) => part.text),
    ["thinking", "edited"],
  );
  assert.deepEqual(parts[0], idlessParts[0], "the other part as stored");
  const read = (await onDevice(b, () => readLocalChatContent("X")))!;
  assert.equal(read.messages[0].parts!.length, 2);
});

test("review8 K2: deleting a message without id keeps the ids of those after it", async () => {
  const b = newDevice();
  b.seed(KEY, { messages: idlessMessages });
  const before = (await onDevice(b, () => readLocalChatContent("X")))!;
  await onDevice(b, async () => {
    await saveChatContent("X", { messages: before.messages.slice(1) }, before);
  });
  const after = (await onDevice(b, () => readLocalChatContent("X")))!;
  assert.deepEqual(
    after.messages.map((message) => [message.id, message.content]),
    [[before.messages[1].id, "first answer"]],
  );
});

test("review8 K1: a stored item reading cannot name (a file without a path) stays with an edit", () => {
  const noPath = { content: "kept", kind: "markdown", updatedAt: 1 };
  const stored = [
    {
      agentId: "ag",
      files: [noPath, workspaceFile("notes/a.md", "old")],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const written = update(stored, readWorkspaces, editA) as Array<{
    files: unknown[];
  }>;
  assert.deepEqual(written[0].files[0], noPath);
  assert.equal(contentOfA(written), "new");
});

test("review8 K1: a list reading shows nothing of keeps its stored items when one is added", () => {
  const copy = { ...idlessSkills[0], id: "b", builtin: true };
  const written = update([copy], normalizeSkills, (list) => [
    ...list,
    { ...normalizeSkills([idlessSkills[0]])[0], id: "new" },
  ]) as Array<{ id: string }>;
  assert.deepEqual(
    written.map((skill) => skill.id),
    ["b", "new"],
  );
});

test("review8 K1: editing a skill file whose stored path reading normalizes keeps one file", () => {
  const stored = [
    {
      ...idlessSkills[0],
      files: [skillFile, { path: "scripts\\run.py", content: "old" }],
    },
  ];
  const written = normalizeSkills(
    update(stored, normalizeSkills, (list) =>
      list.map((skill) => ({
        ...skill,
        files: skill.files.map((f) =>
          f.path === "scripts/run.py" ? { ...f, content: "new" } : f,
        ),
      })),
    ),
  );
  assert.deepEqual(
    written[0].files.map((f) => [f.path, f.content]),
    [
      ["SKILL.md", skillFile.content],
      ["scripts/run.py", "new"],
    ],
  );
});
