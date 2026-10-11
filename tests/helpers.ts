export function browserStorage() {
  const data: Record<string, unknown> = {};
  const writes: Array<{ keys: string[]; bytes: number }> = [];
  const area = {
    async get(key: string | null) {
      return structuredClone(key === null ? data : { [key]: data[key] });
    },
    async set(value: Record<string, unknown>) {
      writes.push({
        keys: Object.keys(value),
        bytes: JSON.stringify(value).length,
      });
      Object.assign(data, structuredClone(value));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
  return { data, writes, area };
}

export function installBrowser(
  local = browserStorage(),
  sync = browserStorage(),
) {
  Object.assign(globalThis, {
    chrome: {
      storage: { local: local.area, sync: sync.area },
    },
  });
  return { local, sync };
}
