// Duration tokens of tokens.css that timers wait on, so a timer that
// unmounts an element after its CSS animation uses the same number.
export const DURATION_TOKEN = {
  fast: "--duration-fast",
  remove: "--duration-remove",
} as const;

type DurationToken = (typeof DURATION_TOKEN)[keyof typeof DURATION_TOKEN];

// A duration token in milliseconds (0 when it is not set).
export function cssDurationMs(
  token: DurationToken,
  element: Element = document.documentElement,
) {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const amount = parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  return value.endsWith("ms") ? amount : amount * 1000;
}
