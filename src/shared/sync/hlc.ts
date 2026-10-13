// Hybrid logical clocks: wall time in ms, a counter for events in the same
// millisecond, the device id as the tie-breaker, and a random nonce per
// change. The string form sorts in clock order, so records compare with a
// plain string comparison. The nonce makes each change's clock its own even
// when two installs share a device id (a copied profile, a restored backup)
// and tick the same wall time and counter: a clock proves which change a
// version holds.

export type Clock = string;

export type HlcState = { wall: number; counter: number };

const WALL_WIDTH = 15;
const COUNTER_WIDTH = 4;
const NONCE_WIDTH = 8;
const CLOCK_PATTERN =
  /^(\d{15})\.([0-9a-z]{4})\.([A-Za-z0-9_-]{1,64})(?:\.([0-9a-z]{8}))?$/;

export const INITIAL_HLC: HlcState = { wall: 0, counter: 0 };

export function formatClock(
  wall: number,
  counter: number,
  device: string,
  nonce?: string,
) {
  return `${String(wall).padStart(WALL_WIDTH, "0")}.${counter
    .toString(36)
    .padStart(COUNTER_WIDTH, "0")}.${device}${nonce ? `.${nonce}` : ""}`;
}

const newNonce = () =>
  [...crypto.getRandomValues(new Uint8Array(NONCE_WIDTH))]
    .map((byte) => (byte % 36).toString(36))
    .join("");

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
  return [formatClock(next.wall, next.counter, device, newNonce()), next];
}

// The clock of data whose age is unknown (stored before changes were
// recorded): older than any change made anywhere.
export const unknownAgeClock = (device: string) => formatClock(0, 0, device);

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

// Whether `clock` is later than every clock this device issued (`state`):
// a clock of this device's id it never made.
export const afterState = (state: HlcState, clock: Clock) =>
  observeClock(state, clock) !== state;
