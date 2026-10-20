import { isOwnUiEvent } from "../shared/page-ui";
import { TEACH_LIMITS, type TeachUnrecorded } from "../shared/teach/types";
import { clickedElement } from "./describe";

// What the user did on the page that the recording could not see, so the
// side panel can warn that steps may be missing:
// - input the page kept from the recorder (a listener of its own that stops
//   events before ours): the browser still grants the page user activation
//   for any trusted press or key, which the recorder sees without the events;
// - a press on a control whose click never came;
// - focus moving into an embedded frame, whose steps are not recorded (only
//   the top frame is).

type UserActivation = { isActive: boolean };

export function watchUnseen(report: (kind: keyof TeachUnrecorded) => void) {
  // When the recorder last saw trusted input (activation from before the
  // start counts as seen), and when it last reported.
  let seenAt = Date.now();
  let reportedAt = 0;
  let pressed: { at: number; clicked: boolean } | undefined;
  const frames = new WeakSet<Element>();

  const missed = () => {
    const now = Date.now();
    if (now - reportedAt < TEACH_LIMITS.activationMs) return;
    reportedAt = now;
    report("input");
  };

  const onInput = (event: Event) => {
    if (event.isTrusted) seenAt = Date.now();
  };
  const onPointerDown = (event: Event) => {
    onInput(event);
    if (!event.isTrusted || isOwnUiEvent(event)) return;
    if (!clickedElement(event.composedPath())) return;
    const press = { at: Date.now(), clicked: false };
    pressed = press;
    setTimeout(() => {
      if (pressed === press && !press.clicked) missed();
    }, TEACH_LIMITS.missedClickMs);
  };
  const onClick = (event: Event) => {
    onInput(event);
    if (pressed) pressed.clicked = true;
  };
  // Focus went into an embedded frame (the window lost it to the frame).
  const onBlur = () =>
    setTimeout(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLIFrameElement) || frames.has(active)) return;
      frames.add(active);
      seenAt = Date.now();
      report("frames");
    });

  const activation = (
    navigator as Navigator & { userActivation?: UserActivation }
  ).userActivation;
  // Activation that starts with no input seen since the last check (timers
  // of hidden tabs run late, so the check's own time counts), or lasts
  // longer than any input seen could have given.
  let wasActive = !!activation?.isActive;
  let checkedAt = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const active = !!activation?.isActive;
    const started = active && !wasActive;
    const lastCheck = checkedAt;
    wasActive = active;
    checkedAt = now;
    if (!active || document.activeElement instanceof HTMLIFrameElement) return;
    if (
      (started && seenAt < lastCheck) ||
      now - seenAt > TEACH_LIMITS.activationMs
    )
      missed();
  }, TEACH_LIMITS.unseenCheckMs);

  const listeners: [string, EventListener][] = [
    ["pointerdown", onPointerDown],
    // Input the user gave outside the page's events (a select's own popup
    // takes keys) ends in a change the page sees.
    ...[
      "mousedown",
      "mouseup",
      "pointerup",
      "keydown",
      "keyup",
      "input",
      "change",
    ].map((type): [string, EventListener] => [type, onInput]),
    ["click", onClick],
  ];
  for (const [type, listener] of listeners)
    addEventListener(type, listener, true);
  addEventListener("blur", onBlur);

  return () => {
    clearInterval(timer);
    for (const [type, listener] of listeners)
      removeEventListener(type, listener, true);
    removeEventListener("blur", onBlur);
  };
}
