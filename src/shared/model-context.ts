export function readContextLength(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const direct = [
    record.context_length,
    record.contextLength,
    record.context_window,
    record.contextWindow,
    record.max_context_length,
    record.maxContextLength,
    record.inputTokenLimit,
  ]
    .map(numericValue)
    .find((item) => item !== undefined);
  if (direct !== undefined) return direct;
  const limits = record.limits;
  if (limits && typeof limits === "object") {
    const limitRecord = limits as Record<string, unknown>;
    const nested = [
      limitRecord.context,
      limitRecord.context_length,
      limitRecord.input_tokens,
    ]
      .map(numericValue)
      .find((item) => item !== undefined);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
