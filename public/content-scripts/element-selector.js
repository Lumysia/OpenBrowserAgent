(() => {
  if (window.__obaElementSelectorActive) return;
  window.__obaElementSelectorActive = true;

  const STORAGE_KEY_PREFERENCES = "preferences";
  const STORAGE_KEY_LANGUAGE = "language";
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
  const SELECTOR_PROMPTS = {
    "en-US": "Select element - Esc to cancel",
    "zh-CN": "选择元素 - 按 Esc 取消",
    "zh-SG": "选择元素 - 按 Esc 取消",
    "zh-TW": "選擇元素 - 按 Esc 取消",
    "zh-HK": "選擇元素 - 按 Esc 取消",
    "ja-JP": "要素を選択 - Escでキャンセル",
    ko: "요소 선택 - Esc로 취소",
    "fr-FR": "Sélectionner un élément - Échap pour annuler",
    "de-DE": "Element auswählen - Esc zum Abbrechen",
    "es-ES": "Seleccionar elemento - Esc para cancelar",
    "pt-BR": "Selecionar elemento - Esc para cancelar",
  };

  let hovered = null;
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
    chrome.i18n?.getMessage("selectorPrompt") || SELECTOR_PROMPTS["en-US"];
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
  loadPreferences().then(applyTheme).catch(() => undefined);
  loadLanguage().then(applyLanguage).catch(() => undefined);
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

  async function loadLanguage() {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(STORAGE_KEY_LANGUAGE).catch(() => ({})),
      chrome.storage.local.get(STORAGE_KEY_LANGUAGE).catch(() => ({})),
    ]);
    return (
      syncData[STORAGE_KEY_LANGUAGE] ||
      localData[STORAGE_KEY_LANGUAGE] ||
      chrome.i18n?.getUILanguage?.() ||
      "en-US"
    );
  }

  function applyLanguage(language) {
    const normalized = String(language || "").replace("_", "-");
    label.textContent =
      SELECTOR_PROMPTS[language] ||
      SELECTOR_PROMPTS[normalized] ||
      chrome.i18n?.getMessage("selectorPrompt") ||
      SELECTOR_PROMPTS["en-US"];
  }

  function cleanup() {
    root.remove();
    document.body.style.cursor = previousCursor;
    removeEventListener("mouseover", onMouseOver, true);
    removeEventListener("mousemove", onMouseMove, true);
    removeEventListener("click", onClick, true);
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

  function onMouseOver(event) {
    const target = event.target;
    if (!isSelectableTarget(target)) return;
    hovered = target;
    updateOverlay(target.getBoundingClientRect());
  }

  function onMouseMove() {
    if (!hovered) return;
    updateOverlay(hovered.getBoundingClientRect());
  }

  function onViewportChange() {
    if (!hovered) return;
    updateOverlay(hovered.getBoundingClientRect());
  }

  function onClick(event) {
    const target = event.target;
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
    chrome.runtime.sendMessage({
      type: "getSelectedElement",
      success: true,
      aiId,
      innerText: target.innerText || "",
      outerHTML: target.outerHTML,
      tagName: target.tagName.toLowerCase(),
      value: "value" in target ? target.value : undefined,
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
    cleanup();
  }

  function isSelectableTarget(target) {
    return target instanceof HTMLElement && !root.contains(target);
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

  addEventListener("mouseover", onMouseOver, true);
  addEventListener("mousemove", onMouseMove, true);
  addEventListener("click", onClick, true);
  addEventListener("keydown", onKeyCancel, true);
  addEventListener("keyup", onKeyCancel, true);
  addEventListener("scroll", onViewportChange, true);
  addEventListener("resize", onViewportChange, true);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
})();
