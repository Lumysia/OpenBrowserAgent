import { areCdpAvailable } from "../../shared/runtime-capabilities";
import { TOOL_NAME } from "../../shared/tool-names";
import { cdpEvaluate, releaseCdp, withCdp, type CdpSend } from "../cdp";
import { pageTab } from "../page-agent";
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
      tabId: { type: "number", description: "Defaults to the active tab." },
      world: { type: "string", enum: ["MAIN", "ISOLATED"] },
      offset: { type: "number" },
    },
    ["code"],
  ),
  async execute(input, { signal }) {
    if (!stringArg(input.code)) return fail("code is required.");
    const tab = await pageTab(input.tabId);
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
    return ok(textSlice(`runScript on tab ${tab.id}`, text, input), {
      tabId: tab.id,
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
    "Developer diagnostics for a tab: resources (network resources the page loaded, with timing and size), emulate (viewport like 390x844x2,mobile; userAgent; colorScheme dark/light/auto; lasts until reset), reset.",
  parameters: schema(
    {
      action: { type: "string", enum: ["resources", "emulate", "reset"] },
      tabId: { type: "number", description: "Defaults to the active tab." },
      viewport: { type: "string" },
      userAgent: { type: "string" },
      colorScheme: { type: "string", enum: ["dark", "light", "auto"] },
    },
    ["action"],
  ),
  async execute(input, { signal }) {
    const tab = await pageTab(input.tabId);
    const action = stringArg(input.action);
    const target = { tabId: tab.id };
    if (action === "reset") {
      await releaseCdp(target);
      return ok(`Emulation on tab ${tab.id} reset.`, { action, tabId: tab.id });
    }
    if (action === "emulate") {
      const result = await withCdp(
        target,
        (send) => emulate(send, input),
        signal,
        true,
      );
      return ok(
        `Emulating on tab ${tab.id}: ${JSON.stringify(result.viewport || {})}. ${result.note}`,
        { action, tabId: tab.id },
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
      `${lines.length} resources (type ms bytes url):\n${lines.slice(0, 200).join("\n")}`,
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
    throw new Error("Provide viewport, userAgent, colorScheme, or reset=true.");
  if (viewport) await send("Emulation.setDeviceMetricsOverride", viewport);
  if (args.userAgent !== undefined)
    await send("Network.setUserAgentOverride", {
      userAgent: String(args.userAgent),
    });
  if (colorScheme !== undefined)
    await send("Emulation.setEmulatedMedia", {
      features:
        colorScheme === "auto"
          ? []
          : [{ name: "prefers-color-scheme", value: colorScheme }],
    });
  return {
    success: true,
    ...(viewport ? { viewport } : {}),
    note: "Emulation remains active until reset=true, debugger detach, or tab closure.",
  };
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
