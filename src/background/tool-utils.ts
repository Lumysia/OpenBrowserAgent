import {
  TOOL_CONTENT_SLICE_DEFAULT_LIMIT,
  TOOL_CONTENT_SLICE_MAX_LIMIT,
  TOOL_LIST_SLICE_DEFAULT_LIMIT,
  TOOL_LIST_SLICE_MAX_LIMIT,
} from "../shared/config";

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function isToolError(output: unknown) {
  return typeof output === "object" && output !== null && "error" in output;
}

export function clampToolOffset(value: unknown) {
  const offset = Number(value);
  return Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
}

export function clampToolContentLimit(value: unknown) {
  return clampToolLimit(
    value,
    TOOL_CONTENT_SLICE_DEFAULT_LIMIT,
    TOOL_CONTENT_SLICE_MAX_LIMIT,
  );
}

export function clampToolListLimit(value: unknown) {
  return clampToolLimit(
    value,
    TOOL_LIST_SLICE_DEFAULT_LIMIT,
    TOOL_LIST_SLICE_MAX_LIMIT,
  );
}

export function withContentSlice(
  metadata: Record<string, unknown>,
  content: string,
  input: Record<string, unknown>,
  field = "content",
) {
  const offset = clampToolOffset(input.offset);
  const limit = clampToolContentLimit(input.limit);
  return {
    ...metadata,
    offset,
    limit,
    totalLength: content.length,
    truncated: offset + limit < content.length,
    [field]: content.slice(offset, offset + limit),
  };
}

export function withListSlice<T>(
  metadata: Record<string, unknown>,
  items: T[],
  input: Record<string, unknown>,
  field: string,
) {
  const offset = clampToolOffset(input.offset);
  const limit = clampToolListLimit(input.limit);
  const sliced = items.slice(offset, offset + limit);
  return {
    ...metadata,
    offset,
    limit,
    totalCount: items.length,
    returnedCount: sliced.length,
    truncated: offset + limit < items.length,
    [field]: sliced,
  };
}

function clampToolLimit(value: unknown, fallback: number, max: number) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(limit)));
}
