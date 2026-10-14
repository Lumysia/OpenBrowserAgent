// App writes: storing only what changed, in the stored form, with ids
// that read the same way every time.
export default [
  {
    name: "B1: synced storage items keep a blind set",
    file: "src/shared/storage.ts",
    from: "  return { ...item, replace: set };",
    to: "  return { ...item, set, replace: set };",
  },
  {
    name: "B1: an MCP test stores the list it read before the test",
    file: "src/background/mcp-tools.ts",
    from: "  const server = (await storage.mcpServers.get()).find(",
    to: "  const read = await storage.mcpServers.get();\n  const server = read.find(",
    also: [
      {
        from: "  const next = await updateById(storage.mcpServers, serverId, (current) => {",
        to: "  const next = await updateById({ update: async (change: (list: typeof read) => typeof read) => { const value = change(read); await storage.mcpServers.replace(value); return value; } }, serverId, (current) => {",
      },
    ],
  },
  {
    name: "B1: a bridge test stores the list it read before the test",
    file: "src/background/local-execution-bridge-tools.ts",
    from: `  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result`,
    to: `  const read = await loadBridges();
  const bridge = read.find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result`,
    also: [
      {
        from: "  const tested = await updateById(\n    storage.localExecutionBridges,",
        to: "  const tested = await updateById(\n    { update: async (change: (list: typeof read) => typeof read) => { const value = change(read); await storage.localExecutionBridges.replace(value); return value; } },",
      },
    ],
  },
  {
    name: "B1: a skill edit stores the list it read first",
    file: "src/background/tools/skills.ts",
    from: "      : await updateById(storage.skills, existing.id, edit);",
    to: "      : await updateById({ update: async (change: (list: typeof all) => typeof all) => { const value = change(all); await storage.skills.replace(value); return value; } }, existing.id, edit);",
  },
  {
    name: "page saves store their whole copy",
    file: "src/shared/rebase.ts",
    from: "  return item.update((current) => rebaseEdit(base, edited, current));",
    to: "  return item.update(() => edited);",
  },
  {
    name: "chat saves store the side panel's copy as is",
    file: "src/shared/chat-storage.ts",
    from: "    if (from && stored && !sameJson(stored, from))",
    to: "    if (false)",
  },
  {
    name: "P3: a source found again overwrites the known one",
    file: "src/shared/chat-sources.ts",
    from: "    if (known.has(key)) continue;",
    to: "    if (known.has(key)) {\n      const index = merged.findIndex((item) => sourceKey(item) === key);\n      merged[index] = { ...merged[index], ...source, id: merged[index].id };\n      continue;\n    }",
    also: [
      {
        from: "  return merged.length === current.length ? current : merged;",
        to: "  return merged;",
      },
    ],
  },
  {
    name: "P4: workspaces get the default files they lack back",
    file: "src/shared/workspace.ts",
    from: "  return missing.length\n    ? [...workspaces, ...missing.map((agent) => createWorkspace(agent.id))]\n    : workspaces;",
    to: "  return [\n    ...workspaces.map((workspace) => ({\n      ...workspace,\n      files: normalizeWorkspaceFiles([\n        ...createWorkspace(workspace.agentId).files.filter(\n          (file) => !workspace.files.some((item) => item.path === file.path),\n        ),\n        ...workspace.files,\n      ]),\n    })),\n    ...missing.map((agent) => createWorkspace(agent.id)),\n  ];",
  },
  {
    name: "guard: an update stores the normalized form of the whole value",
    file: "src/shared/storage.ts",
    from: "          [key]: keepStoredForm(stored, current, normalized),",
    to: "          [key]: normalized,",
  },
  {
    name: "guard: an update that changes nothing still stores",
    file: "src/shared/storage.ts",
    from: "        if (sameJson(normalized, current)) return next;",
    to: "",
  },
  {
    name: "guard: a chat save stores the loaded (normalized) form of every message",
    file: "src/shared/chat-storage.ts",
    from: "    const write = keepStoredForm(raw, stored ?? content, content);",
    to: "    const write = content;",
  },
  {
    name: "guard: defaults filled in on read are stored with a changed item",
    file: "src/shared/stored-form.ts",
    from: "      if (sameJson(shown[key], value)) continue;",
    to: "",
  },
  {
    name: "guard: fields dropped on read are lost with a changed item",
    file: "src/shared/stored-form.ts",
    from: "    if (!(key in shown) && !(key in next)) result[key] = stored[key];",
    to: "",
  },
  {
    name: "guard: list items are not matched by id",
    file: "src/shared/stored-form.ts",
    from: "  if (!field) return next;",
    to: "  return next;",
  },
  {
    name: "P5: providers are stored as read, without normalizing",
    file: "src/shared/storage.ts",
    from: "    normalize: normalizeProviderState,\n",
    to: "",
  },
  {
    name: "P5: renaming a provider renames every model",
    file: "entrypoints/options/provider-drafts.ts",
    from: "      model.displayName?.startsWith(from)",
    to: "      true",
  },
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
  {
    name: "S2: loading a chat adds append: false to every part",
    file: "src/shared/chats.ts",
    from: "    append: part.append === true || undefined,",
    to: "    append: part.append === true,",
  },
];
