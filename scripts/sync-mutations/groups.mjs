// Sync groups, encrypted keys and damaged roots: what a device without a
// group's content or key must leave alone, and recovery from a root that
// cannot be read.
export default [
  {
    name: "keys are stored on the server without sealing them",
    file: "src/shared/sync/keys.ts",
    from: `    if (!isEncrypted(recordId) || record.deleted || !("data" in record))
      continue;`,
    to: "    continue;",
  },
  {
    name: "a device without the key strips the keys from the server",
    file: "src/shared/sync/keys.ts",
    from: "  if (!keysOn(next)) {",
    to: "  if (!keysOn(next) || !keys.unlocked) {",
  },
  {
    name: "sealed records a device cannot open are dropped",
    file: "src/shared/sync/keys.ts",
    from: "  if (!keys.unlocked) return root;",
    to: "",
  },
  {
    name: "an item without files has an empty files record",
    file: "src/shared/sync/stored-collections.ts",
    from: "      return body.length ? { data: {}, body } : undefined;",
    to: "      return { data: {}, body };",
  },
  {
    name: "a backend without room syncs large content",
    file: "src/shared/sync/collections.ts",
    from: "      (!collection.largeContent || capabilities.largeContent) &&",
    to: "",
  },
  {
    name: "a damaged root stops sync",
    file: "src/shared/sync/transport.ts",
    from: "  if (!(error instanceof SyncFormatError) || error.newerFormat) throw error;",
    to: "  throw error;",
  },
  {
    name: "the root being replaced is not kept",
    file: "src/shared/sync/webdav.ts",
    from: "      if (previous) {",
    to: "      if (previous && !previous) {",
  },
];
