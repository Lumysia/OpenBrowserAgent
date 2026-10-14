import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { TOOL_NAME } from "../../shared/tool-names";
import { cdpEvaluate, releaseCdp, withCdp, type CdpSend } from "../cdp";
import { pageTab } from "../page-agent";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import { pageHeader } from "./page";
import { textSlice } from "./read";
import { fail, ok, schema, stringArg, type ToolDefinition } from "./types";

// Tools on the Chrome debugger: page JavaScript (its own, default-off
// group) and diagnostics. Both detach after each call, except emulation,
// which lasts until reset.

const available = () => areCdpAvailable();

export const runScriptTool: ToolDefinition = {
  name: TOOL_NAME.runScript,
  group: "scripts",
  onDemand: true,
  boundedOutput: true,
  available,
  summary: "Run JavaScript in a page",
  description:
    "Evaluate JavaScript in a tab (main world by default, or ISOLATED) and return its JSON value. Use only when snapshot, act and editPage cannot do the job.",
  parameters: schema(
    {
      code: {
        type: "string",
        description: "An expression or async IIFE; its value is returned.",
      },
      tabId: RUN_TAB_ID_PARAM,
      world: { type: "string", enum: ["MAIN", "ISOLATED"] },
      offset: { type: "number" },
    },
    ["code"],
  ),
  async execute(input, { run, signal }) {
    if (!stringArg(input.code)) return fail("code is required.");
    const tab = await pageTab(run.tab, input.tabId);
    const result = (await withCdp(
      { tabId: tab.id },
      (send) => evaluate(send, input),
      signal,
    )) as { success?: boolean; value?: unknown; error?: string };
    if (result.success === false) return fail(`Script error: ${result.error}`);
    const text =
      typeof result.value === "string"
        ? result.value
        : (JSON.stringify(result.value) ?? "undefined");
    return ok(textSlice(`runScript on ${pageHeader(tab)}`, text, input), {
      tabId: tab.id,
      title: tab.title,
      chars: text.length,
    });
  },
};

export const devtoolsTool: ToolDefinition = {
  name: TOOL_NAME.devtools,
  group: "devtools",
  onDemand: true,
  available,
  summary: "Network resources and device emulation",
  description:
    "Developer diagnostics for a tab: resources (network resources the page loaded, with timing and size), emulate (viewport like 390x844x2,mobile: a mobile viewport also sets the screen size and turns on touch; userAgent, which is unchanged unless given; colorScheme dark/light/auto; lasts until reset), reset (ends all emulation).",
  parameters: schema(
    {
      action: { type: "string", enum: ["resources", "emulate", "reset"] },
      tabId: RUN_TAB_ID_PARAM,
      viewport: { type: "string" },
      userAgent: { type: "string" },
      colorScheme: { type: "string", enum: ["dark", "light", "auto"] },
    },
    ["action"],
  ),
  async execute(input, { run, signal }) {
    const tab = await pageTab(run.tab, input.tabId);
    const action = stringArg(input.action);
    const target = { tabId: tab.id };
    if (action === "reset") {
      const active = await releaseCdp(target, resetEmulation);
      return ok(
        active
          ? `Emulation on tab ${tab.id} reset: viewport, screen size, touch, user agent and color scheme are the browser's own again.`
          : `Nothing was emulated on tab ${tab.id}; nothing to reset.`,
        { action, tabId: tab.id, reset: active },
      );
    }
    if (action === "emulate") {
      const result = await withCdp(
        target,
        (send) => emulate(send, input),
        signal,
        true,
      );
      return ok(
        `Emulating on tab ${tab.id}: ${result.changes.join("; ")}. ${EMULATION_NOTE}`,
        { action, tabId: tab.id, ...result.details },
      );
    }
    if (action !== "resources")
      return fail('action must be "resources", "emulate" or "reset".');
    const result = await withCdp(
      target,
      (send) =>
        cdpEvaluate(
          send,
          "performance.getEntriesByType('resource').map(r=>[r.initiatorType,Math.round(r.duration),r.transferSize,r.name].join(' '))",
        ),
      signal,
    );
    if (result.exception) return fail(result.exception);
    const lines = Array.isArray(result.value) ? (result.value as string[]) : [];
    return ok(
      `${pageHeader(tab)}\n${lines.length} resources (type ms bytes url):\n${lines.slice(0, 200).join("\n")}`,
      { action, tabId: tab.id, count: lines.length },
    );
  },
};

async function emulate(send: CdpSend, args: Record<string, unknown>) {
  let viewport;
  if (args.viewport !== undefined) {
    const match = String(args.viewport)
      .trim()
      .match(/^(\d+)[x,](\d+)(?:[x,](\d+(?:\.\d+)?))?(?:,(mobile))?$/i);
    if (!match) throw new Error("Invalid viewport. Use WxH[xDPR][,mobile].");
    viewport = {
      width: Number(match[1]),
      height: Number(match[2]),
      deviceScaleFactor: Number(match[3] || 1),
      mobile: !!match[4],
    };
  } else if (args.width !== undefined || args.height !== undefined) {
    viewport = {
      width: Number(args.width),
      height: Number(args.height),
      deviceScaleFactor: 1,
      mobile: false,
    };
  }
  if (
    viewport &&
    !(
      Number.isInteger(viewport.width) &&
      Number.isInteger(viewport.height) &&
      viewport.width > 0 &&
      viewport.height > 0 &&
      viewport.deviceScaleFactor > 0
    )
  )
    throw new Error(
      "Viewport dimensions and device scale must be positive and valid.",
    );
  const colorScheme = args.colorScheme;
  if (
    colorScheme !== undefined &&
    !["dark", "light", "auto"].includes(String(colorScheme))
  )
    throw new Error("Invalid color scheme.");
  if (!viewport && args.userAgent === undefined && colorScheme === undefined)
    throw new Error(
      'Provide viewport, userAgent or colorScheme; to end emulation use {"action":"reset"}.',
    );
  // What changed, in the order applied, for the receipt.
  const changes: string[] = [];
  if (viewport) {
    // A phone's screen is its viewport; 0 keeps the real screen size.
    const screen = viewport.mobile
      ? { screenWidth: viewport.width, screenHeight: viewport.height }
      : { screenWidth: 0, screenHeight: 0 };
    await send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      ...screen,
    });
    await send("Emulation.setTouchEmulationEnabled", {
      enabled: viewport.mobile,
      ...(viewport.mobile ? { maxTouchPoints: MOBILE_TOUCH_POINTS } : {}),
    });
    changes.push(
      `viewport ${viewport.width}x${viewport.height} at device scale ${viewport.deviceScaleFactor}, ${viewport.mobile ? "mobile" : "desktop"}`,
      viewport.mobile
        ? `screen size ${viewport.width}x${viewport.height}`
        : "screen size not overridden",
      viewport.mobile ? "touch on" : "touch off",
    );
  }
  const userAgent =
    args.userAgent === undefined ? undefined : String(args.userAgent);
  if (userAgent !== undefined) {
    await send("Network.setUserAgentOverride", { userAgent });
    changes.push(`user agent "${userAgent}"`);
  } else changes.push("user agent unchanged (pass userAgent to set one)");
  if (colorScheme !== undefined) {
    await send("Emulation.setEmulatedMedia", {
      features:
        colorScheme === "auto"
          ? []
          : [{ name: "prefers-color-scheme", value: colorScheme }],
    });
    changes.push(
      colorScheme === "auto"
        ? "color scheme follows the system"
        : `color scheme ${colorScheme}`,
    );
  }
  return {
    changes,
    details: {
      ...(viewport
        ? {
            viewport,
            screen: viewport.mobile
              ? { width: viewport.width, height: viewport.height }
              : null,
            touch: viewport.mobile,
          }
        : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
      ...(colorScheme !== undefined ? { colorScheme } : {}),
    },
  };
}

const MOBILE_TOUCH_POINTS = 5;
const EMULATION_NOTE =
  'This lasts until {"action":"reset"}, the debugger detaching, or the tab closing.';

// Clears what emulate may have set; the detach that follows ends the rest.
async function resetEmulation(send: CdpSend) {
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setEmulatedMedia", { features: [] });
}

async function evaluate(send: CdpSend, args: Record<string, unknown>) {
  let contextId;
  if (args.world === "ISOLATED") {
    const tree = await send("Page.getFrameTree");
    const world = await send("Page.createIsolatedWorld", {
      frameId: tree.frameTree.frame.id,
      worldName: "OpenBrowserAgent",
    });
    contextId = world.executionContextId;
    // Without a context id, Runtime.evaluate would run in the MAIN world.
    if (!Number.isInteger(contextId) || contextId <= 0)
      throw new Error("CDP did not return a valid isolated execution context.");
  }
  const result = await send("Runtime.evaluate", {
    expression: `(async () => { try { const value = await (0,eval)(${JSON.stringify(String(args.code))}); if(value === undefined) return {success:true,value:{type:'undefined'}}; try {return {success:true,value:JSON.parse(JSON.stringify(value))}} catch {return {success:true,value:String(value)}} } catch(error) {return {success:false,error:error instanceof Error ? error.message : String(error)}} })()`,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {}),
  });
  if (result.exceptionDetails)
    return { success: false, error: result.exceptionDetails.text };
  return result.result?.value || { success: false };
}
