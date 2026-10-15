import { providerType, type ProviderId } from "./providers";

// One spelling of an endpoint's base URL, for keys and for appending paths.
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

// The key of an endpoint, for state kept per endpoint.
export function baseUrlKey(baseUrl: string) {
  return normalizeBaseUrl(baseUrl).toLowerCase();
}

// The base URL of the provider's API: the stored one (else the type's
// default) and the path the type serves its API under. "" when there is
// none.
export function providerApiBase(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
) {
  const { defaultBaseUrl, apiPath } = providerType(type);
  const base = normalizeBaseUrl(baseUrl || defaultBaseUrl || "");
  return base ? `${base}${apiPath ?? ""}` : "";
}

// `path` ("/chat/completions") on the provider's API.
export function providerApiUrl(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
  path: string,
) {
  return `${providerApiBase(type, baseUrl)}${path}`;
}
