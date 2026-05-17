(() => {
  if (window.__obaElementSelectorActive) return;
  window.__obaElementSelectorActive = true;

  let hovered = null;
  let previousOutline = "";
  let previousCursor = document.body.style.cursor;
  const overlay = document.createElement("div");
  overlay.textContent = "Select element - Esc to cancel";
  Object.assign(overlay.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 12px",
    borderRadius: "999px",
    background: "#1f8a5b",
    color: "#fff",
    font: "13px system-ui, sans-serif",
    boxShadow: "0 8px 28px rgba(0,0,0,.2)",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(overlay);
  document.body.style.cursor = "crosshair";

  function clearHover() {
    if (hovered) hovered.style.outline = previousOutline;
    hovered = null;
    previousOutline = "";
  }

  function cleanup() {
    clearHover();
    overlay.remove();
    document.body.style.cursor = previousCursor;
    removeEventListener("mouseover", onMouseOver, true);
    removeEventListener("click", onClick, true);
    removeEventListener("keydown", onKeyDown, true);
    window.__obaElementSelectorActive = false;
  }

  function onMouseOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === overlay) return;
    clearHover();
    hovered = target;
    previousOutline = target.style.outline;
    target.style.outline = "2px solid #1f8a5b";
  }

  function onClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === overlay) return;
    event.preventDefault();
    event.stopPropagation();
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

  function onKeyDown(event) {
    if (event.key === "Escape") cleanup();
  }

  addEventListener("mouseover", onMouseOver, true);
  addEventListener("click", onClick, true);
  addEventListener("keydown", onKeyDown, true);
})();
