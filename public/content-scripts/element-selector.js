(() => {
  if (window.__obaElementSelectorActive) return;
  window.__obaElementSelectorActive = true;

  const STORAGE_KEY_PREFERENCES = "preferences";
  const MESSAGE_CANCEL = "cancelElementSelector";
  const MESSAGE_CANCELLED = "elementSelectorCancelled";
  const Z_INDEX = "2147483647";
  const DIM_OPACITY = 0.42;
  const ACCENT_COLORS = {
    amber: "#f59e0b",
    blue: "#3b82f6",
    green: "#22c55e",
    pink: "#ec4899",
    purple: "#8b5cf6",
  };
  const DEFAULT_PREFERENCES = {
    colorScheme: "system",
    accentColor: "amber",
  };
  const DEFAULT_SELECTOR_PROMPT = "Select element - Esc to cancel";

  let hovered = null;
  let hoverCandidates = [];
  let hoverIndex = 0;
  let currentRect = null;
  const previousCursor = document.body.style.cursor;

  const root = document.createElement("div");
  root.setAttribute("data-oba-selector-root", "true");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: Z_INDEX,
    pointerEvents: "none",
    font: "13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  });

  const highlight = document.createElement("div");
  Object.assign(highlight.style, {
    position: "fixed",
    left: "0",
    top: "0",
    border: "2px solid var(--oba-selector-accent)",
    borderRadius: "10px",
    boxShadow:
      "0 0 0 1px color-mix(in srgb, var(--oba-selector-accent), transparent 40%), 0 0 0 9999px var(--oba-selector-mask), 0 12px 32px rgba(0,0,0,.24)",
    transition:
      "transform 80ms ease, width 80ms ease, height 80ms ease, border-color 120ms ease, box-shadow 120ms ease",
  });
  root.appendChild(highlight);

  const label = document.createElement("div");
  label.textContent =
    window.__obaElementSelectorPrompt || DEFAULT_SELECTOR_PROMPT;
  Object.assign(label.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 18px",
    border: "1px solid var(--oba-selector-border)",
    borderRadius: "999px",
    background: "var(--oba-selector-surface)",
    color: "var(--oba-selector-foreground)",
    font: "20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "620",
    letterSpacing: "-0.015em",
    boxShadow: "0 14px 38px rgba(0,0,0,.26)",
  });
  root.appendChild(label);

  applyTheme(DEFAULT_PREFERENCES);
  document.documentElement.appendChild(root);
  document.body.style.cursor = "crosshair";
  loadPreferences()
    .then(applyTheme)
    .catch(() => undefined);
  updateOverlay(null);

  function applyTheme(preferences) {
    const accent =
      ACCENT_COLORS[preferences?.accentColor] || ACCENT_COLORS.amber;
    const dark =
      preferences?.colorScheme === "dark" ||
      (preferences?.colorScheme !== "light" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    root.style.setProperty("--oba-selector-accent", accent);
    root.style.setProperty(
      "--oba-selector-surface",
      dark ? "rgba(15, 23, 42, .9)" : "rgba(255, 255, 255, .92)",
    );
    root.style.setProperty(
      "--oba-selector-foreground",
      dark ? "#f8fafc" : "#0f172a",
    );
    root.style.setProperty(
      "--oba-selector-border",
      dark ? "rgba(255,255,255,.18)" : "rgba(15,23,42,.14)",
    );
    root.style.setProperty(
      "--oba-selector-mask",
      dark
        ? `rgba(2, 6, 23, ${DIM_OPACITY})`
        : `rgba(15, 23, 42, ${DIM_OPACITY * 0.82})`,
    );
  }

  async function loadPreferences() {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(STORAGE_KEY_PREFERENCES).catch(() => ({})),
      chrome.storage.local.get(STORAGE_KEY_PREFERENCES).catch(() => ({})),
    ]);
    return {
      ...DEFAULT_PREFERENCES,
      ...(localData[STORAGE_KEY_PREFERENCES] || {}),
      ...(syncData[STORAGE_KEY_PREFERENCES] || {}),
    };
  }

  function cleanup() {
    root.remove();
    document.body.style.cursor = previousCursor;
    removeEventListener("mouseover", onPointerMove, true);
    removeEventListener("mousemove", onMouseMove, true);
    removeEventListener("click", onClick, true);
    removeEventListener("wheel", onWheel, true);
    removeEventListener("keydown", onKeyCancel, true);
    removeEventListener("keyup", onKeyCancel, true);
    removeEventListener("scroll", onViewportChange, true);
    removeEventListener("resize", onViewportChange, true);
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    window.__obaElementSelectorActive = false;
  }

  function cancel() {
    chrome.runtime.sendMessage({
      type: MESSAGE_CANCELLED,
      success: false,
    });
    cleanup();
  }

  function onPointerMove(event) {
    const candidates = selectableCandidatesAt(event.clientX, event.clientY);
    if (!candidates.length) return;
    const current = hoverCandidates[hoverIndex];
    hoverCandidates = candidates;
    hoverIndex = Math.max(0, candidates.indexOf(current));
    hovered = hoverCandidates[hoverIndex];
    updateOverlay(hovered.getBoundingClientRect());
  }

  function onMouseMove(event) {
    onPointerMove(event);
  }

  function onWheel(event) {
    if (!hoverCandidates.length) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const direction = event.deltaY > 0 ? 1 : -1;
    hoverIndex = Math.max(
      0,
      Math.min(hoverCandidates.length - 1, hoverIndex + direction),
    );
    hovered = hoverCandidates[hoverIndex];
    if (!hovered) return;
    updateOverlay(hovered.getBoundingClientRect());
  }

  function onViewportChange() {
    if (!hovered) return;
    updateOverlay(hovered.getBoundingClientRect());
  }

  async function onClick(event) {
    const target =
      hovered || selectableCandidatesAt(event.clientX, event.clientY)[0];
    if (!isSelectableTarget(target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const aiId =
      target.getAttribute("data-ai-id") ||
      (crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 15));
    target.setAttribute("data-ai-id", aiId);
    document
      .querySelectorAll('[data-oba-selected="true"]')
      .forEach((node) => node.removeAttribute("data-oba-selected"));
    target.setAttribute("data-oba-selected", "true");
    const image = imageFromTarget(target);
    chrome.runtime.sendMessage({
      type: "getSelectedElement",
      success: true,
      aiId,
      innerText: target.innerText || "",
      outerHTML: target.outerHTML,
      tagName: target.tagName.toLowerCase(),
      value: "value" in target ? target.value : undefined,
      imageSrc: image?.currentSrc || image?.src || undefined,
      imageAlt: image?.alt || undefined,
      imageWidth: image?.naturalWidth || image?.width || undefined,
      imageHeight: image?.naturalHeight || image?.height || undefined,
      imageDataUrl: image ? await imageToDataUrl(image) : undefined,
    });
    cleanup();
  }

  function onRuntimeMessage(message) {
    if (message?.type === MESSAGE_CANCEL) cancel();
  }

  function onKeyCancel(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cancel();
  }

  function isSelectableTarget(target) {
    return target instanceof HTMLElement && !root.contains(target);
  }

  function selectableCandidatesAt(x, y) {
    const candidates = [];
    const seen = new Set();
    for (const element of document.elementsFromPoint(x, y)) {
      let current = element;
      while (current instanceof HTMLElement && current !== document.body) {
        if (isSelectableTarget(current) && !seen.has(current)) {
          seen.add(current);
          candidates.push(current);
        }
        current = current.parentElement;
      }
    }
    return candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function imageFromTarget(target) {
    if (target instanceof HTMLImageElement) return target;
    if (target instanceof HTMLElement) return target.querySelector("img");
    return null;
  }

  async function imageToDataUrl(image) {
    if (image.currentSrc?.startsWith("data:")) return image.currentSrc;
    if (image.src?.startsWith("data:")) return image.src;
    const src = image.currentSrc || image.src;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      if (canvas.width && canvas.height && context) {
        context.drawImage(image, 0, 0);
        return canvas.toDataURL("image/png");
      }
    } catch {
      // Cross-origin images may taint canvas; fall back to fetch below.
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return undefined;
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  function updateOverlay(rect) {
    currentRect = rect ? clampRect(rect) : null;
    if (!currentRect) {
      positionHighlight(0, 0, 0, 0);
      highlight.style.opacity = "0";
      return;
    }

    const { top, left, width, height } = currentRect;
    positionHighlight(left, top, width, height);
    highlight.style.opacity = "1";
  }

  function clampRect(rect) {
    const top = Math.max(0, Math.min(innerHeight, rect.top));
    const left = Math.max(0, Math.min(innerWidth, rect.left));
    const right = Math.max(left, Math.min(innerWidth, rect.right));
    const bottom = Math.max(top, Math.min(innerHeight, rect.bottom));
    return {
      top,
      left,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function positionHighlight(left, top, width, height) {
    Object.assign(highlight.style, {
      transform: `translate(${left}px, ${top}px)`,
      width: `${Math.max(0, width)}px`,
      height: `${Math.max(0, height)}px`,
    });
  }

  addEventListener("mouseover", onPointerMove, true);
  addEventListener("mousemove", onMouseMove, true);
  addEventListener("click", onClick, true);
  addEventListener("wheel", onWheel, { capture: true, passive: false });
  addEventListener("keydown", onKeyCancel, true);
  addEventListener("keyup", onKeyCancel, true);
  addEventListener("scroll", onViewportChange, true);
  addEventListener("resize", onViewportChange, true);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
})();
