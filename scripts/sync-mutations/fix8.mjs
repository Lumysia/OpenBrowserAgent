// The eighth fix's guards: list items filled in on read, the read form as
// a chat save's base, and default workspaces.
export default [
  {
    name: "B1: list items filled in on read are stored with a change",
    file: "src/shared/stored-form.ts",
    from: "      if (reordered || !sameJson(before, item)) keep(item, id);",
    to: "      keep(item, id);",
  },
  {
    name: "B1: a reorder leaves the items filled in on read unstored",
    file: "src/shared/stored-form.ts",
    from: "      if (reordered || !sameJson(before, item)) keep(item, id);",
    to: "      if (!sameJson(before, item)) keep(item, id);",
  },
  {
    name: "B1: stored items dropped on read are lost with a change",
    file: "src/shared/stored-form.ts",
    from: "    if (id === undefined || (!shownIds.has(id) && !nextIds.has(id)))",
    to: "    if (false)",
  },
  {
    name: "B1: stored items dropped on read move to the start",
    file: "src/shared/stored-form.ts",
    from: "      if (found >= 0) index = found + 1;",
    to: "",
  },
  {
    name: "B1: a list never stored is stored whole",
    file: "src/shared/stored-form.ts",
    from: "  if (stored === undefined && !Array.isArray(shown)) return next;",
    to: "  if (stored === undefined) return next;",
  },
  {
    name: "B1: a list field never stored is stored whole",
    file: "src/shared/stored-form.ts",
    from: "      result[key] = keepStoredForm(undefined, shown[key], value);",
    to: "      result[key] = value;",
  },
  {
    name: "B1: built-in MCP servers are filled in as defined, not as read",
    file: "src/shared/mcp.ts",
    from: "const BUILTINS = BUILTIN_MCP_SERVERS.map(",
    to: "const BUILTINS = BUILTIN_MCP_SERVERS || [].map(",
  },
  {
    name: "B1: built-in MCP servers a list lacks go after its servers",
    file: "src/shared/mcp.ts",
    from: "  result.splice(Math.max(first, 0), 0, ...leading);",
    to: "  result.push(...leading);",
  },
  {
    name: "S1: a chat save returns the stored form",
    file: "src/shared/chat-storage.ts",
    from: "    content = normalizeChatContent(write);",
    to: "    content = write;",
  },
  {
    name: "S1: a chat save merges from its base as given",
    file: "src/shared/chat-storage.ts",
    from: "    const from = base && normalizeChatContent(base);",
    to: "    const from = base;",
  },
  {
    name: "D2: workspaces that never agreed merge without a base",
    file: "src/shared/sync/collections.ts",
    from: '    newBody: () => createWorkspace("").files,',
    to: "",
  },
  {
    name: "D1: files differing only in edit time are different files",
    file: "src/shared/sync/merge-content.ts",
    from: "    sameFile,\n",
    to: "",
  },
  {
    name: "D1: equal entries still go through the conflict rule",
    file: "src/shared/sync/merge-content.ts",
    from: "    if (same(mineEntry, theirsEntry)) result.set(id, newerEntry);",
    to: "    if (false) result.set(id, newerEntry);",
  },
];
