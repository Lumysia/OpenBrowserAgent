// A Retry-After header (seconds or an HTTP date) in milliseconds, held
// within `min` and `max`; undefined when there is none or it is not one.
export function parseRetryAfter(
  value: string | null,
  { min = 0, max = Infinity }: { min?: number; max?: number } = {},
  now = Date.now(),
) {
  if (!value) return undefined;
  const ms = /^\s*\d+\s*$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  if (!Number.isFinite(ms)) return undefined;
  return Math.min(max, Math.max(min, ms));
}
