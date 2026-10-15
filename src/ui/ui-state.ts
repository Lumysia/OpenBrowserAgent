// What the app's own elements are doing, set as their data-state attribute
// (as Radix does for open and closed) rather than as a class, one word per
// state.
export const UI_STATE = {
  idle: "idle",
  loading: "loading",
  done: "done",
  error: "error",
  // On the way out: animating before it is removed.
  removing: "removing",
  // A view sliding in, and the one it replaces.
  entering: "entering",
  leaving: "leaving",
  // A slot that is always laid out and fades in when it has content.
  visible: "visible",
  // An image that failed to load.
  broken: "broken",
} as const;

type UiState = (typeof UI_STATE)[keyof typeof UI_STATE];

// The data-state for a flag: the state while it holds, nothing otherwise.
export const stateWhen = (flag: unknown, state: UiState) =>
  flag ? state : undefined;
