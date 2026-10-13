// The ninth fix's guards: stored items named the same way when reading and
// saving, and resets to default workspace files.
export default [
  {
    name: "K2: ids made up on read change on every read",
    file: "src/shared/read-ids.ts",
    from: '  return typeof id === "string" && id ? id : madeUpId(item, index);',
    to: '  return typeof id === "string" && id ? id : crypto.randomUUID();',
  },
  {
    name: "K2: equal items at different places get the same made-up id",
    file: "src/shared/read-ids.ts",
    from: "  return `read-${index}-${",
    to: "  return `read-${",
  },
  {
    name: "K1: chat summaries make up random ids",
    file: "src/shared/chats.ts",
    from: "    id: readId(value, index),\n    title:",
    to: "    id: crypto.randomUUID(),\n    title:",
  },
  {
    name: "K2: chat messages make up random ids",
    file: "src/shared/chats.ts",
    from: "    id: readId(value, index),\n    role:",
    to: "    id: stringValue(message.id) || crypto.randomUUID(),\n    role:",
  },
  {
    name: "K2: message parts make up random ids",
    file: "src/shared/chats.ts",
    from: "    id: readId(value, index),\n    type:",
    to: "    id: stringValue(part.id) || crypto.randomUUID(),\n    type:",
  },
  {
    name: "K1: stored MCP servers make up random ids",
    file: "src/shared/mcp.ts",
    from: "      : readId(value, index);",
    to: "      : stringValue(item.id) || `mcp_${nanoid(8)}`;",
  },
  {
    name: "K1: stored skills make up random ids",
    file: "src/shared/skills.ts",
    from: "      : readId(skill, index);",
    to: "      : stringValue(source.id) || crypto.randomUUID();",
  },
  {
    name: "K1: skill file paths read in another form than saves name them",
    file: "src/shared/skills.ts",
    from: "  const path = readPath(file?.path);",
    to: "  const path = stringValue(file?.path).trim();",
  },
  {
    name: "K1: saves name stored items by their raw id",
    file: "src/shared/stored-form.ts",
    from: "  const storedKeys = stored.map(readKey);",
    to: '  const storedKeys = stored.map((item) =>\n    isRecord(item) && typeof item[field] === "string" ? (item[field] as string) : undefined,\n  );',
  },
  {
    name: "K1: stored items reading cannot name are lost with a change",
    file: "src/shared/stored-form.ts",
    from: "    if (id === undefined || (!shownIds.has(id) && !nextIds.has(id)))",
    to: "    if (id !== undefined && !shownIds.has(id) && !nextIds.has(id))",
  },
  {
    name: "K1: a list reading shows nothing of is stored as the change made it",
    file: "src/shared/stored-form.ts",
    from: "  const items = [...shown, ...next];",
    to: "  const items = shown.length ? shown : [undefined];",
  },
  {
    name: "K2: an edited or moved item without id reads back with another id",
    file: "src/shared/stored-form.ts",
    from: "    return id === undefined || readKey(item, at) === id",
    to: "    return true",
  },
  {
    name: "W1: a newer reset to a default file counts as unchanged",
    file: "src/shared/sync/merge-content.ts",
    from: "    return time(reset) <= time(other);",
    to: "    return true;",
  },
  {
    name: "W1: a default file one side lacks is no base",
    file: "src/shared/sync/merge-content.ts",
    from: "    if (!mineFile || !theirsFile) return true;",
    to: "    if (!mineFile || !theirsFile) return false;",
  },
  {
    name: "W1: default files of a new workspace carry its creation time",
    file: "src/shared/workspace.ts",
    from: "      updatedAt: 0,",
    to: "      updatedAt: Date.now(),",
  },
  {
    name: "W1: reading gives never-edited files the read time",
    file: "src/shared/workspace.ts",
    from: "      updatedAt: Number.isFinite(file.updatedAt) ? file.updatedAt : Date.now(),",
    to: "      updatedAt: file.updatedAt || Date.now(),",
  },
];
