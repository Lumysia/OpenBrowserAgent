import { TOOL_ERROR } from "../shared/tool-errors";
import { cdpCall, type CdpRun, type CdpSend } from "./cdp-session";

export async function runCdpInput(args: Record<string, unknown>, run: CdpRun) {
  const operation = String(args.operation || args.action || "click");
  if (["click", "hover", "doubleClick"].includes(operation)) {
    let point = { x: Number(args.x) || 0, y: Number(args.y) || 0 };
    if (args.id || args.uid) {
      const result = await cdpCall(
        run,
        args,
        `(id) => {
        const element = document.querySelector('[data-ai-id="' + CSS.escape(id) + '"]');
        if (!element) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementNotFound)}};
        const target = element.closest('button,a,[role="button"],[role="link"],[role="tab"],[role="listitem"],[role="gridcell"],[tabindex],[contenteditable="true"]') || element;
        target.scrollIntoView({block:"center",inline:"center"});
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementHasNoClickableBox)}};
        return {success:true,x:rect.left+rect.width/2,y:rect.top+rect.height/2,clickedTag:target.tagName.toLowerCase(),clickedRole:target.getAttribute("role") || undefined};
      }`,
        [String(args.id || args.uid)],
      );
      if (result.exception) return { success: false, error: result.exception };
      if (!result.value?.success) return result.value || { success: false };
      point = result.value;
    }
    return run(args, async (send) => {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x,
        y: point.y,
      });
      if (operation !== "hover")
        for (
          let clickCount = 1;
          clickCount <= (operation === "doubleClick" ? 2 : 1);
          clickCount++
        ) {
          await send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: point.x,
            y: point.y,
            button: "left",
            buttons: 1,
            clickCount,
          });
          await send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: point.x,
            y: point.y,
            button: "left",
            buttons: 0,
            clickCount,
          });
        }
      return { success: true, ...point, action: operation };
    });
  }
  if (operation === "fill") return fill(args, run);
  if (operation === "fillForm") {
    const results = [];
    for (const element of Array.isArray(args.elements) ? args.elements : [])
      results.push(
        await fill(
          {
            ...(element as object),
            tabId: args.tabId,
            targetId: args.targetId,
            url: args.url,
            title: args.title,
          },
          run,
        ),
      );
    return { success: results.every((result) => result?.success), results };
  }
  return run(args, async (send) => {
    if (operation === "key") return pressKey(send, args.key);
    if (operation === "type") {
      const text = String(args.text || "");
      await send("Input.insertText", { text });
      if (args.submitKey) await pressKey(send, args.submitKey);
      return { success: true, textLength: text.length };
    }
    if (operation === "drag") {
      const from = { x: Number(args.fromX) || 0, y: Number(args.fromY) || 0 };
      const to = { x: Number(args.toX) || 0, y: Number(args.toY) || 0 };
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...from,
        button: "left",
        buttons: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...to,
        buttons: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...to,
        button: "left",
        buttons: 0,
      });
      return { success: true, from, to };
    }
    if (operation === "dialog") {
      await send("Page.handleJavaScriptDialog", {
        accept: args.action !== "dismiss",
        promptText: String(args.promptText || ""),
      });
      return { success: true };
    }
    return { success: false, error: "UNKNOWN_CDP_INPUT_OPERATION", operation };
  });
}

async function fill(args: Record<string, unknown>, run: CdpRun) {
  const result = await cdpCall(
    run,
    args,
    `(id, value) => {
    const element = document.querySelector('[data-ai-id="' + CSS.escape(id) + '"]');
    if (!element) return {success:false,error:${JSON.stringify(TOOL_ERROR.elementNotFound)}};
    element.focus?.();
    if ("value" in element) element.value = value; else element.textContent = value;
    element.dispatchEvent(new InputEvent("input",{bubbles:true,data:value}));
    element.dispatchEvent(new Event("change",{bubbles:true}));
    return {success:true};
  }`,
    [String(args.id || args.uid || ""), String(args.value ?? "")],
  );
  return result.exception
    ? { success: false, error: result.exception }
    : result.value || { success: false };
}

async function pressKey(send: CdpSend, value: unknown) {
  const combination = String(value || "Enter");
  const parts = combination.split("+");
  const key = parts.pop() || "+";
  const flags: Record<string, number> = {
    Alt: 1,
    Control: 2,
    Ctrl: 2,
    Meta: 4,
    Shift: 8,
  };
  const modifiers = parts.reduce((bits, part) => bits | (flags[part] || 0), 0);
  const virtualKeys: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Escape: 27,
    Backspace: 8,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    " ": 32,
  };
  const windowsVirtualKeyCode =
    virtualKeys[key] ||
    (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    modifiers,
    windowsVirtualKeyCode,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    modifiers,
    windowsVirtualKeyCode,
  });
  return { success: true, key: combination };
}
