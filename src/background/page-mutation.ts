import { isScriptableUrl } from "../shared/browser";
import { getBrowserApi } from "../shared/storage";
import { TOOL_ERROR } from "../shared/tool-errors";
import {
  injectPageDom,
  objectInput,
  readPageTarget,
  stringInput,
} from "./page-dom";
import { mutatePageInDom } from "./page-mutation-in-page";

export async function mutatePage(
  args: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const api = getBrowserApi();
  const tabId = Number(args.tabId);
  if (!Number.isFinite(tabId) || tabId <= 0)
    return { success: false, error: TOOL_ERROR.noActiveWebTabFound };
  const tab = await api.tabs.get(tabId);
  signal?.throwIfAborted();
  if (!isScriptableUrl(tab.url))
    return { success: false, error: TOOL_ERROR.activeTabNotWebPage };

  const operation = Array.isArray(args.operations)
    ? "batch"
    : stringInput(args.operation || args.action);
  if (isStyleOperation(operation)) {
    await applyStyle(tabId, args);
    return { success: true, tabId, operation };
  }

  // Style items in a batch use the extension stylesheet API, like a single
  // style operation; the page script only knows DOM operations.
  const request = buildMutationRequest(args);
  const items = batchItems(args);
  const styleResults = new Map<number, Record<string, unknown>>();
  for (const [index, item] of items.entries()) {
    const itemOperation = stringInput(item.operation || item.action);
    if (!isStyleOperation(itemOperation)) continue;
    signal?.throwIfAborted();
    await applyStyle(tabId, { ...args, ...item });
    styleResults.set(index, { success: true, operation: itemOperation });
  }
  if (items.length && styleResults.size === items.length)
    return {
      tabId,
      operation,
      success: true,
      results: [...styleResults.values()],
    };
  if (styleResults.size)
    request.operations = request.operations.filter(
      (_, index) => !styleResults.has(index),
    );

  await injectPageDom(tabId);
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    args: [request],
    func: mutatePageInDom,
  });
  let output: Record<string, unknown> = result.result ?? {
    success: false,
    error: "Mutation script returned no result.",
    errorCode: "NO_MUTATION_RESULT",
  };
  if (styleResults.size) {
    const domResults = (
      "results" in output && Array.isArray(output.results)
        ? output.results
        : [output]
    ) as Array<Record<string, unknown>>;
    const results = items.map(
      (_, index) => styleResults.get(index) ?? domResults.shift() ?? {},
    );
    output = {
      success: results.every((item) => item.success !== false),
      results,
    };
  }
  if (isNewTabRequest(output)) {
    signal?.throwIfAborted();
    const created = await api.tabs.create({ url: output.url, active: false });
    return {
      success: true,
      tabId,
      operation,
      openedTabId: created.id,
      shouldWaitTabLoadFinished: true,
    };
  }
  return { tabId, operation, ...output };
}

export type MutationOperation = ReturnType<typeof buildMutationOptions>;
export type MutationRequest = { operations: MutationOperation[] };

function isStyleOperation(operation: string) {
  return operation === "insertStyle" || operation === "removeStyle";
}

async function applyStyle(tabId: number, args: Record<string, unknown>) {
  const injection = {
    target: { tabId },
    css: stringInput(args.css || args.value),
  };
  if (stringInput(args.operation || args.action) === "insertStyle")
    await getBrowserApi().scripting.insertCSS(injection);
  else await getBrowserApi().scripting.removeCSS(injection);
}

function batchItems(args: Record<string, unknown>) {
  return Array.isArray(args.operations)
    ? args.operations
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .slice(0, 10)
    : [];
}

function buildMutationRequest(args: Record<string, unknown>) {
  const operations = batchItems(args);
  return {
    operations: operations.length
      ? operations.map((operation) =>
          buildMutationOptions({ ...args, ...operation }),
        )
      : [buildMutationOptions(args)],
  };
}

function isNewTabRequest(
  output: unknown,
): output is { newTab: true; url: string } {
  return (
    !!output &&
    typeof output === "object" &&
    (output as { newTab?: unknown }).newTab === true &&
    typeof (output as { url?: unknown }).url === "string"
  );
}

function buildMutationOptions(args: Record<string, unknown>) {
  return {
    operation: stringInput(args.operation || args.action),
    target: readPageTarget(args),
    value: textInput(args.value ?? args.text ?? args.html),
    node: objectInput(args.node),
    attribute: stringInput(args.attribute ?? args.name),
    position: stringInput(args.position || "beforeend"),
    dedupeKey: stringInput(args.dedupeKey),
    skipIfExistsSelector: stringInput(args.skipIfExistsSelector),
    openLinksInNewTab: args.openLinksInNewTab === true,
    scroll: {
      direction: stringInput(args.direction),
      x: numberInput(args.x),
      y: numberInput(args.y),
      behavior: stringInput(args.behavior || "smooth"),
    },
    key: {
      key: stringInput(args.key || args.value || "Enter"),
      code: stringInput(args.code),
      ctrlKey: args.ctrlKey === true,
      shiftKey: args.shiftKey === true,
      altKey: args.altKey === true,
      metaKey: args.metaKey === true,
    },
  };
}

function textInput(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberInput(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
