// The seventh fix's guards against background rewrites.
export default [
  {
    name: "P1: the background answers an attach to a missing run with an end",
    file: "src/background/stream-sessions.ts",
    from: '  if (!session) return post(port, { type: "notRunning" });',
    to: '  if (!session) return post(port, { type: "end" });',
  },
  {
    name: "P1: the panel stores an end for a run the background does not have",
    file: "entrypoints/sidepanel/stream-port.ts",
    from: "      onRunStopped(chatId, activeMessageId);",
    to: "      updateRunMetrics(activeMessageId, { endedAt: Date.now() });",
  },
  {
    name: "P2: a running chat is never held",
    file: "src/shared/sync/collections-chats.ts",
    from: "  hold: (id, env) => !!env.runActive?.(id),",
    to: "  hold: () => false,",
  },
  {
    name: "P2: the background's sync does not know which chats run",
    file: "src/background/sync/service.ts",
    from: "    runActive: isChatRunning,",
    to: "",
  },
  {
    name: "P2: a finished run kept for replay still holds its chat",
    file: "src/background/stream-sessions.ts",
    from: "  return !!session && !session.cleanupTimeout;",
    to: "  return !!session;",
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
];
