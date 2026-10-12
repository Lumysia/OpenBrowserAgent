// Hybrid logical clocks: wall time in ms, a counter for events in the same
// millisecond, and the device id as the final tie-breaker. The string form
// sorts in clock order, so records compare with a plain string comparison.

export type Clock = string;

export type HlcState = { wall: number; counter: number };

const WALL_WIDTH = 15;
const COUNTER_WIDTH = 4;
const CLOCK_PATTERN = /^(\d{15})\.([0-9a-z]{4})\.([A-Za-z0-9_-]{1,64})$/;

export const INITIAL_HLC: HlcState = { wall: 0, counter: 0 };

export function formatClock(wall: number, counter: number, device: string) {
  return `${String(wall).padStart(WALL_WIDTH, "0")}.${counter
    .toString(36)
    .padStart(COUNTER_WIDTH, "0")}.${device}`;
}

export function parseClock(clock: unknown) {
  if (typeof clock !== "string") return undefined;
  const match = CLOCK_PATTERN.exec(clock);
  if (!match) return undefined;
  return {
    wall: Number(match[1]),
    counter: parseInt(match[2], 36),
    device: match[3],
  };
}

export const isClock = (value: unknown): value is Clock => !!parseClock(value);

export function compareClocks(
  left: Clock | undefined,
  right: Clock | undefined,
) {
  if (left === right) return 0;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  return left < right ? -1 : 1;
}

export const newerClock = (left: Clock, right: Clock) =>
  compareClocks(left, right) >= 0 ? left : right;

// A local event at `wall` (the time the edit was seen). The clock never goes
// backwards, even when the wall clock does or a remote clock ran ahead.
export function tickClock(
  state: HlcState,
  device: string,
  wall: number,
): [Clock, HlcState] {
  const next =
    wall > state.wall
      ? { wall, counter: 0 }
      : { wall: state.wall, counter: state.counter + 1 };
  return [formatClock(next.wall, next.counter, device), next];
}

// Take in a clock seen on another device, so later local events order after it.
export function observeClock(state: HlcState, clock: Clock): HlcState {
  const parsed = parseClock(clock);
  if (!parsed) return state;
  if (parsed.wall > state.wall)
    return { wall: parsed.wall, counter: parsed.counter };
  if (parsed.wall === state.wall && parsed.counter > state.counter)
    return { wall: state.wall, counter: parsed.counter };
  return state;
}
