// Byte-level helpers shared by the sync engine and its transports.

import { bytesToHex } from "../binary";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// JSON with object keys sorted, so equal values give equal bytes (and hashes)
// whatever order their keys were written in. `undefined` fields are dropped.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? Object.fromEntries(
          Object.entries(child)
            .filter(([, entry]) => entry !== undefined)
            .sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
        )
      : child,
  );
}

export const jsonBytes = (value: unknown) =>
  encoder.encode(canonicalJson(value));
export const bytesText = (bytes: Uint8Array) => decoder.decode(bytes);
export const sameJson = (left: unknown, right: unknown) =>
  canonicalJson(left) === canonicalJson(right);

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

export const hashJson = (value: unknown) => sha256Hex(jsonBytes(value));

export const isBlobHash = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export async function gzip(bytes: Uint8Array) {
  return pipe(bytes, new CompressionStream("gzip"));
}

export async function gunzip(bytes: Uint8Array) {
  return pipe(bytes, new DecompressionStream("gzip"));
}

async function pipe(bytes: Uint8Array, transform: GenericTransformStream) {
  const stream = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
