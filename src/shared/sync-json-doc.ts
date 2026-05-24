const SYNC_JSON_DOCUMENT_PREFIX = "OpenBrowserAgentSyncJSON:";
const SYNC_JSON_DOCUMENT_FORMAT = "openbrowseragent.sync-json.v1";

type SyncJsonDocument<T = unknown> = {
  format: typeof SYNC_JSON_DOCUMENT_FORMAT;
  updatedAt: number;
  value?: T;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readSyncDocumentValue<T>(
  key: string,
  remoteBytes: Uint8Array | undefined,
  remoteVersion?: string,
  fallbackValue?: T,
) {
  if (!remoteBytes) return undefined;
  const jsonValue = decodeSyncJsonDocument<T>(remoteBytes);
  if (jsonValue.decoded) return jsonValue.value;
  if (fallbackValue !== undefined) return fallbackValue;

  const legacy = await import("./automerge-sync-doc");
  return legacy.readAutomergeValue<T>(key, remoteBytes, remoteVersion);
}

export function writeSyncDocumentValue<T>(value: T) {
  const document = {
    format: SYNC_JSON_DOCUMENT_FORMAT,
    updatedAt: Date.now(),
    value,
  } satisfies SyncJsonDocument<T>;
  return {
    bytes: encoder.encode(
      `${SYNC_JSON_DOCUMENT_PREFIX}${JSON.stringify(document)}`,
    ),
    value,
  };
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeSyncJsonDocument<T>(bytes: Uint8Array) {
  const text = decoder.decode(bytes);
  if (!text.startsWith(SYNC_JSON_DOCUMENT_PREFIX))
    return { decoded: false as const };
  try {
    const document = JSON.parse(
      text.slice(SYNC_JSON_DOCUMENT_PREFIX.length),
    ) as Partial<SyncJsonDocument<T>>;
    if (document.format !== SYNC_JSON_DOCUMENT_FORMAT)
      return { decoded: false as const };
    return { decoded: true as const, value: document.value };
  } catch {
    return { decoded: false as const };
  }
}
