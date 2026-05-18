import { useEffect, useRef, useState } from "react";
import {
  STREAM_REVEAL_BACKLOG_LARGE,
  STREAM_REVEAL_BACKLOG_MEDIUM,
  STREAM_REVEAL_BACKLOG_SMALL,
  STREAM_REVEAL_BACKLOG_TINY,
  STREAM_REVEAL_MAX_STEP_DELAY_MS,
  STREAM_REVEAL_MIN_STEP_DELAY_MS,
  STREAM_REVEAL_STEP_LARGE,
  STREAM_REVEAL_STEP_MEDIUM,
  STREAM_REVEAL_STEP_SMALL,
  STREAM_REVEAL_STEP_TINY,
} from "../../src/shared/config";

export function useThrottledText(value: string, delayMs: number) {
  const [displayLength, setDisplayLength] = useState(
    () => Array.from(value).length,
  );
  const [animatedFrom, setAnimatedFrom] = useState(displayLength);
  const displayLengthRef = useRef(displayLength);

  useEffect(() => {
    displayLengthRef.current = displayLength;
  }, [displayLength]);

  useEffect(() => {
    const targetLength = Array.from(value).length;
    let timeout: number | undefined;

    if (targetLength < displayLengthRef.current) {
      displayLengthRef.current = targetLength;
      setAnimatedFrom(targetLength);
      setDisplayLength(targetLength);
      return undefined;
    }

    function schedule() {
      const backlog = targetLength - displayLengthRef.current;
      if (backlog <= 0) return;
      timeout = window.setTimeout(step, stepDelay(backlog, delayMs));
    }

    function step() {
      setDisplayLength((current) => {
        const backlog = targetLength - current;
        const next = Math.min(targetLength, current + stepSize(backlog));
        setAnimatedFrom(current);
        displayLengthRef.current = next;
        return next;
      });
      schedule();
    }

    schedule();
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  const characters = Array.from(value);
  return {
    text: characters.slice(0, displayLength).join(""),
    animatedFrom: Math.min(animatedFrom, displayLength),
  };
}

function stepSize(backlog: number) {
  if (backlog > STREAM_REVEAL_BACKLOG_LARGE) return STREAM_REVEAL_STEP_LARGE;
  if (backlog > STREAM_REVEAL_BACKLOG_MEDIUM) return STREAM_REVEAL_STEP_MEDIUM;
  if (backlog > STREAM_REVEAL_BACKLOG_SMALL) return STREAM_REVEAL_STEP_SMALL;
  if (backlog > STREAM_REVEAL_BACKLOG_TINY) return STREAM_REVEAL_STEP_TINY;
  return 1;
}

function stepDelay(backlog: number, baselineMs: number) {
  const dynamicDelay = Math.round(baselineMs / Math.max(1, Math.sqrt(backlog)));
  return Math.min(
    STREAM_REVEAL_MAX_STEP_DELAY_MS,
    Math.max(STREAM_REVEAL_MIN_STEP_DELAY_MS, dynamicDelay),
  );
}
