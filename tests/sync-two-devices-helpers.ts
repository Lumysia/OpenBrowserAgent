// Helpers of the two-device WebDAV script (sync-two-devices.ts).
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { Transport } from "../src/shared/sync/transport";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import { ALL_ON, chat, device, type Device } from "./sync-fixtures";

export const CHATS = STORAGE_KEYS.chats;
export const run = Date.now().toString(36);
export const log: string[] = [];
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
// WsgiDAV's ETag has one-second resolution: space writes of a case apart.
export const tick = () => sleep(1100);

// `next`: whether a request fails before reaching the server; `loseAnswer`:
// whether it reaches the server and its answer is lost (a timeout).
export type FailingFetch = {
  next?: (method: string) => boolean;
  loseAnswer?: (method: string, path: string) => boolean;
};

export function loggingFetch(name: string, fail?: FailingFetch) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = new URL(String(input));
    if (fail?.next?.(method)) {
      log.push(`${name} ${method} ${url.pathname} -> (network error)`);
      throw new TypeError("fetch failed");
    }
    const response = await fetch(input, init);
    const path = url.pathname.replace(/.*\/case-[^/]+\//, "");
    log.push(`${name} ${method} ${path} ${response.status}`);
    if (fail?.loseAnswer?.(method, path)) {
      log.push(`${name} ${method} ${path} -> (answer lost)`);
      throw new DOMException("The operation timed out.", "TimeoutError");
    }
    return response;
  };
}

export async function folder(base: string, name: string) {
  const url = `${base.replace(/\/?$/, "/")}case-${run}-${name}/`;
  const response = await fetch(url, { method: "MKCOL" });
  if (!response.ok && response.status !== 405)
    throw new Error(`MKCOL ${response.status}`);
  return url;
}

// Two devices on one folder reached through `urls`; `wrapB` wraps b's
// transport (to hook its requests).
export function pair(
  name: string,
  urls: string[],
  failA?: FailingFetch,
  wrapB: (transport: Transport) => Transport = (transport) => transport,
) {
  const clock = {
    get now() {
      return Date.now();
    },
  };
  // One after the other: parallel MKCOLs of one folder fail on WsgiDAV.
  return folder(urls[0], name)
    .then(async (urlA) => [urlA, await folder(urls[1], name)])
    .then(([urlA, urlB]) => ({
      a: device(
        "deviceA",
        createWebDavTransport({ url: urlA }, loggingFetch("A", failA)),
        clock,
        ALL_ON,
      ),
      b: device(
        "deviceB",
        wrapB(createWebDavTransport({ url: urlB }, loggingFetch("B"))),
        clock,
        ALL_ON,
      ),
    }));
}

export async function saveChat(
  on: Device,
  id: string,
  messages: Array<[string, number]>,
) {
  const { summary, content } = chat(id, messages);
  const list = (on.get<Array<{ id: string }>>(CHATS) ?? []).filter(
    (item) => item.id !== id,
  );
  await on.set(CHATS, [...list, summary]);
  await on.set(`${CHATS}/${id}`, content);
}

export const ids = (on: Device) =>
  (on.get<Array<{ id: string }>>(CHATS) ?? []).map((item) => item.id).sort();
export const messages = (on: Device, id: string) =>
  on
    .get<{ messages: Array<{ id: string }> }>(`${CHATS}/${id}`)
    ?.messages.map((m) => m.id);
