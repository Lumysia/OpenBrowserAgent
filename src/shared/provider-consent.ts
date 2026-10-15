import { normalizeProviderConfig } from "./provider-instances";
import { storage } from "./storage";
import type { ProviderConfig } from "./types";
import { providerEndpoint } from "./provider-urls";
import { ProviderConsentError } from "./user-errors";

// Content the user shares (messages, page text, screenshots, files) goes to
// a provider's endpoint only with the user's permission for that endpoint's
// host, stored with the provider (and synced with it). Endpoints on this
// device or the local network need none.

// The base URL as entered, else the type's own endpoint (provider-urls.ts).
// The entered text is read as it is, not as the resolver spells it, so the
// host of a text that is no URL stays the one stored with its consent.
function endpointUrl(provider: ProviderConfig) {
  return provider.baseUrl?.trim() || providerEndpoint(provider.type, undefined);
}

function parseEndpoint(provider: ProviderConfig) {
  return parseUrl(endpointUrl(provider));
}

function parseUrl(url: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return { host: parsed.host, hostname: parsed.hostname };
  } catch {
    const raw = url.toLowerCase();
    return { host: raw, hostname: raw };
  }
}

// The host (with a non-default port) content would be sent to, as shown to
// the user and stored with the consent.
export function providerConsentHost(provider: ProviderConfig) {
  return parseEndpoint(provider)?.host || "";
}

// Whether sending content to this provider needs the user's permission: its
// endpoint is not on this device or the local network.
export function providerNeedsConsent(provider: ProviderConfig) {
  const endpoint = parseEndpoint(provider);
  return !!endpoint && !isLocalHost(endpoint.hostname);
}

// Whether an endpoint URL is on this device or the local network.
export function isLocalEndpoint(url: string) {
  const endpoint = parseUrl(url);
  return !!endpoint && isLocalHost(endpoint.hostname);
}

// The provider may receive content now: it needs no permission, or the
// user gave it for the host its endpoint is at now.
export function providerHasConsent(provider: ProviderConfig) {
  return (
    !providerNeedsConsent(provider) ||
    provider.consent?.host === providerConsentHost(provider)
  );
}

export function withProviderConsent(
  provider: ProviderConfig,
  allowed: boolean,
  now = Date.now(),
): ProviderConfig {
  const { consent: _previous, ...rest } = provider;
  return allowed
    ? {
        ...rest,
        consent: { host: providerConsentHost(provider), grantedAt: now },
      }
    : rest;
}

// Stores the permission for the provider, but only while its endpoint is
// still at `host` (the host the user was shown). False when it is not.
export async function grantProviderConsent(providerId: string, host: string) {
  let granted = false;
  await storage.provider.update((providers) => {
    const provider = providers[providerId];
    if (!provider || providerConsentHost(provider) !== host) return providers;
    granted = true;
    if (providerHasConsent(provider)) return providers;
    return {
      ...providers,
      [providerId]: withProviderConsent(provider, true),
    };
  });
  return granted;
}

// Throws unless the provider may receive content now.
export function assertProviderConsent(
  providerId: string,
  provider: ProviderConfig,
) {
  const config = normalizeProviderConfig(providerId, provider);
  if (!providerHasConsent(config))
    throw new ProviderConsentError(providerId, providerConsentHost(config));
}

// Hostnames on this device or the local network: localhost and .local
// names, loopback, private, link-local and unspecified addresses.
export function isLocalHost(hostname: string) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  )
    return true;
  const ipv4 = parseIPv4(host);
  if (ipv4) return isLocalIPv4(ipv4);
  const ipv6 = host.includes(":") ? parseIPv6(host) : undefined;
  return !!ipv6 && isLocalIPv6(ipv6);
}

function parseIPv4(host: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  const parts = match?.slice(1).map(Number);
  return parts?.every((part) => part <= 255) ? parts : undefined;
}

function isLocalIPv4([a, b, c, d]: number[]) {
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a + b + c + d === 0
  );
}

// The eight 16-bit groups of an IPv6 address, or undefined.
function parseIPv6(host: string) {
  let address = host.replace(/%.*$/, "");
  const embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (embedded) {
    const ipv4 = parseIPv4(embedded[1]);
    if (!ipv4) return undefined;
    const hex = (high: number, low: number) => ((high << 8) | low).toString(16);
    address = `${address.slice(0, embedded.index)}${hex(ipv4[0], ipv4[1])}:${hex(ipv4[2], ipv4[3])}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return undefined;
  const groups = (part: string) => (part ? part.split(":") : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined;
  const all = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!all.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return undefined;
  return all.map((group) => parseInt(group, 16));
}

function isLocalIPv6(groups: number[]) {
  const zeroes = (count: number) =>
    groups.slice(0, count).every((group) => group === 0);
  // ::1 and ::
  if (zeroes(7) && groups[7] <= 1) return true;
  // IPv4-mapped (::ffff:a.b.c.d).
  if (zeroes(5) && groups[5] === 0xffff)
    return isLocalIPv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  // Unique local fc00::/7 and link-local fe80::/10.
  return (groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80;
}
