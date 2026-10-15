import { providerType, type ProviderId } from "./providers";

// One spelling of an endpoint's base URL, for keys and for appending paths.
export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

// The key of an endpoint, for state kept per endpoint.
export function baseUrlKey(baseUrl: string) {
  return normalizeBaseUrl(baseUrl).toLowerCase();
}

// The provider's base URL: the stored one, else the type's default. "" when
// there is none.
export function providerBaseUrl(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
) {
  return normalizeBaseUrl(
    baseUrl?.trim() || providerType(type).defaultBaseUrl || "",
  );
}

// The base URL of the provider's API: the base URL and the path the type
// serves its API under. "" when there is none (the SDK's own endpoint).
export function providerApiBase(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
) {
  const base = providerBaseUrl(type, baseUrl);
  return base ? `${base}${providerType(type).apiPath ?? ""}` : "";
}

// Where the provider's API is: its API base, else the SDK's own endpoint.
export function providerEndpoint(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
) {
  return (
    providerApiBase(type, baseUrl) ||
    normalizeBaseUrl(providerType(type).sdkEndpoint || "")
  );
}

// `path` ("/chat/completions") on the provider's API.
export function providerApiUrl(
  type: ProviderId | undefined,
  baseUrl: string | undefined,
  path: string,
) {
  return `${providerEndpoint(type, baseUrl)}${path}`;
}
