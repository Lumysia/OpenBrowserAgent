import { BINARY_STRING_CHUNK_SIZE } from "./config";

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BINARY_STRING_CHUNK_SIZE)
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + BINARY_STRING_CHUNK_SIZE),
    );
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
