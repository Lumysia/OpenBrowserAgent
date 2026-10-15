import type { Api } from "@earendil-works/pi-ai";

// A failed request, as the fallbacks in pi-provider.ts see it: the HTTP
// status when known, and Pi's error text (which carries the response body).
type RequestRejection = { status?: number; message: string };

// Statuses with which an endpoint refuses a request it cannot accept as
// written. Rate limits, overload and server errors are not about a field.
export const FIELD_REJECTION_STATUSES: readonly number[] = [400, 422];

// Records the status of the responses a request gets, for SDKs that take a
// fetch function (Pi's OpenAI and Anthropic adapters).
export function statusRecorder(
  base: typeof fetch = (...args) => fetch(...args),
) {
  let status: number | undefined;
  const recording: typeof fetch = async (input, init) => {
    const response = await base(input, init);
    status = response.status;
    return response;
  };
  return { fetch: recording, status: () => status };
}

// The Gemini SDK takes no fetch function; its error text is the response
// body, whose `error.code` is the HTTP status.
function bodyStatus(message: string) {
  try {
    const code = JSON.parse(message)?.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

export function requestRejection(
  api: Api,
  message: string,
  recordedStatus: number | undefined,
): RequestRejection {
  return {
    status:
      api === "google-generative-ai" ? bodyStatus(message) : recordedStatus,
    message,
  };
}

// The words of an identifier or a text, lower case: "thinkingBudget",
// "thinking_budget" and "Thinking budget" all give thinking, budget.
function words(text: string) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Whether the endpoint refused the request over one of `fields`. A field is
// a name the request sent, matched when every word of it appears in the
// error, or a pattern for an endpoint's own wording. With `statuses`, the
// response must have one of them.
export function rejectsField(
  rejection: RequestRejection,
  fields: ReadonlyArray<string | RegExp>,
  statuses?: readonly number[],
) {
  if (
    statuses &&
    (rejection.status === undefined || !statuses.includes(rejection.status))
  )
    return false;
  const said = new Set(words(rejection.message));
  return fields.some((field) =>
    typeof field === "string"
      ? words(field).every((word) => said.has(word))
      : field.test(rejection.message),
  );
}
