import { readContextLength } from "./model-context";
import {
  providerAuthHeaders,
  providerModelList,
  providerType,
  type ProviderId,
  type ProviderModelList,
} from "./providers";
import { providerBaseUrl, providerEndpoint } from "./provider-urls";
import type { ProviderConfig } from "./types";
import { USER_ERROR_CODE, UserError } from "./user-errors";

// Each provider's model list is fetched live from its endpoint: the request
// and the reading of its answer for each kind of list.

type ModelListRequest = {
  url: string;
  headers: Record<string, string>;
};

// A model an endpoint lists: the name requests use, and what it tells of it.
type ListedModel = {
  name: string;
  label?: string;
  contextLength?: number;
};

type ModelRecord = Record<string, unknown>;

type ModelListProtocol = {
  // The path on the provider's API, or on the server's root (its base URL
  // without the type's API path).
  path: string;
  atRoot?: boolean;
  headers?: Record<string, string>;
  // The listed models, in the endpoint's order.
  parse: (data: unknown) => ListedModel[];
};

// Anthropic's API requires a version; this is the one its models list has.
const ANTHROPIC_VERSION = "2023-06-01";

const MODEL_LISTS: Record<ProviderModelList, ModelListProtocol> = {
  // OpenAI's /models, and the compatible servers that answer with `models`
  // or plain names.
  openai: {
    path: "/models",
    parse: (data) =>
      entries(data, "data", "models").flatMap((model) => {
        const name = text(model, "id") || text(model, "name");
        return name ? [{ name, contextLength: readContextLength(model) }] : [];
      }),
  },
  anthropic: {
    path: "/models",
    headers: { "anthropic-version": ANTHROPIC_VERSION },
    parse: (data) =>
      entries(data, "data", "models").flatMap((model) => {
        const name = text(model, "id") || text(model, "name");
        return name
          ? [
              {
                name,
                label: text(model, "display_name") || name,
                contextLength: readContextLength(model),
              },
            ]
          : [];
      }),
  },
  // Only the models that generate content (not embedding models).
  gemini: {
    path: "/models",
    parse: (data) =>
      entries(data, "models").flatMap((model) => {
        const name = text(model, "name").replace(/^models\//, "");
        const methods = model.supportedGenerationMethods;
        return name &&
          Array.isArray(methods) &&
          methods.includes("generateContent")
          ? [
              {
                name,
                label: text(model, "displayName") || undefined,
                contextLength: readContextLength(model),
              },
            ]
          : [];
      }),
  },
  // Ollama's own API at the server's root, beside the OpenAI one.
  ollama: {
    path: "/api/tags",
    atRoot: true,
    parse: (data) =>
      entries(data, "models").flatMap((model) => {
        const name = text(model, "name");
        return name ? [{ name }] : [];
      }),
  },
};

export function modelListRequest(
  type: ProviderId,
  config: Pick<ProviderConfig, "baseUrl" | "apiKey">,
): ModelListRequest {
  const protocol = MODEL_LISTS[providerModelList(type)];
  const base = protocol.atRoot
    ? providerBaseUrl(type, config.baseUrl)
    : providerEndpoint(type, config.baseUrl);
  if (!base)
    throw new UserError(
      USER_ERROR_CODE.baseUrlRequired,
      "Base URL is required",
    );
  return {
    url: `${base}${protocol.path}`,
    headers: {
      ...protocol.headers,
      ...(providerType(type).keyless
        ? {}
        : providerAuthHeaders(type, config.apiKey)),
    },
  };
}

export function parseModelList(type: ProviderId, data: unknown) {
  return MODEL_LISTS[providerModelList(type)].parse(data);
}

// The entries of the first of `keys` that holds a list; a plain name stands
// for `{ name }`.
function entries(data: unknown, ...keys: string[]): ModelRecord[] {
  if (!data || typeof data !== "object") return [];
  const record = data as ModelRecord;
  const list = keys.map((key) => record[key]).find(Array.isArray) ?? [];
  return list.flatMap((item: unknown) =>
    typeof item === "string"
      ? [{ name: item }]
      : item && typeof item === "object"
        ? [item as ModelRecord]
        : [],
  );
}

function text(model: ModelRecord, key: string) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
