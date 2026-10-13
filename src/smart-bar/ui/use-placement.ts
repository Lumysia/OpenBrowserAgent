import { useLayoutEffect, useRef, type RefObject } from "react";
import { anchorRect, placeSmartBar } from "../placement";
import { selectionRect, type SelectionSnapshot } from "../selection";

// Keeps the element next to the selection as the page scrolls or resizes and
// as the element itself grows (a streaming result).
export function usePlacement(
  ref: RefObject<HTMLElement | null>,
  snapshot: SelectionSnapshot,
  onOffscreen: (() => void) | undefined,
) {
  const onOffscreenRef = useRef(onOffscreen);
  useLayoutEffect(() => {
    onOffscreenRef.current = onOffscreen;
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const { pointOffset } = snapshot;
    const update = () => {
      const offscreen = onOffscreenRef.current;
      const base = selectionRect(snapshot);
      if (!base) return offscreen?.();
      // The containing block is the viewport, or a transformed modal dialog
      // the host was moved into.
      element.style.left = "0px";
      element.style.top = "0px";
      const origin = element.getBoundingClientRect();
      const placement = placeSmartBar({
        anchor: anchorRect(
          base,
          pointOffset,
          snapshot.target.kind === "control",
        ),
        x: pointOffset && base.left + pointOffset.x,
        size: { width: origin.width, height: origin.height },
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
      });
      if (placement.offscreen && offscreen) return offscreen();
      element.style.left = `${placement.left - origin.left}px`;
      element.style.top = `${placement.top - origin.top}px`;
      // The entrance grows from the selection.
      element.dataset.side = placement.side;
      element.style.setProperty("--origin-x", `${placement.originX}px`);
    };
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    addEventListener("scroll", schedule, { capture: true, passive: true });
    addEventListener("resize", schedule);
    visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      removeEventListener("scroll", schedule, { capture: true });
      removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("resize", schedule);
    };
  }, [ref, snapshot]);
}
