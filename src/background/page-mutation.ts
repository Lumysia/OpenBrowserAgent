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
  if (operation === "insertStyle" || operation === "removeStyle") {
    const injection = {
      target: { tabId },
      css: stringInput(args.css || args.value),
    };
    if (operation === "insertStyle") await api.scripting.insertCSS(injection);
    else await api.scripting.removeCSS(injection);
    return { success: true, tabId, operation };
  }

  await injectPageDom(tabId);
  const [result] = await api.scripting.executeScript({
    target: { tabId },
    args: [buildMutationRequest(args)],
    func: mutatePageInDom,
  });
  const output = result.result ?? {
    success: false,
    error: "Mutation script returned no result.",
    errorCode: "NO_MUTATION_RESULT",
  };
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

function buildMutationRequest(args: Record<string, unknown>) {
  const operations = Array.isArray(args.operations)
    ? args.operations
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .slice(0, 10)
    : [];
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
