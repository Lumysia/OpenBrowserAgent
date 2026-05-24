import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";

export function cdpToolDetail(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const tab = idLabel("Tab", input.tabId || output.tabId);
  if (name === BROWSER_TOOL_NAME.cdpInput) return cdpInputDetail(tab, input);
  if (name === BROWSER_TOOL_NAME.cdpPage)
    return cdpPageDetail(tab, input, output);
  if (name === BROWSER_TOOL_NAME.cdpEvaluateScript)
    return compactJoin([
      tab,
      codeSummary(input.function || input.expression),
      outputPreview(output),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript)
    return compactJoin([tab, codeSummary(input.code), outputPreview(output)]);
  if (name === BROWSER_TOOL_NAME.cdpTakeScreenshot)
    return compactJoin([
      tab,
      stringValue(output.filePath),
      stringValue(input.format),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpDiagnostics)
    return compactJoin([
      tab,
      stringValue(input.operation),
      arrayCount("requests", output.requests),
      arrayCount("messages", output.messages),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpPerformanceStartTrace)
    return compactJoin([tab, input.reload ? "reload" : undefined]);
  if (name === BROWSER_TOOL_NAME.cdpPerformanceStopTrace)
    return compactJoin([tab, countValue("insights", output.insightCount)]);
  if (name === BROWSER_TOOL_NAME.cdpPerformanceAnalyzeInsight)
    return compactJoin([
      stringValue(input.insightName),
      stringValue(input.insightSetId),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpTakeMemorySnapshot)
    return compactJoin([
      tab,
      stringValue(output.filePath) || stringValue(input.filePath),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpGetMemorySnapshotDetails)
    return compactJoin([
      stringValue(input.filePath),
      arrayCount("items", output.items),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpGetNodesByClass)
    return compactJoin([
      stringValue(input.filePath),
      idLabel("Class", input.uid),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpLoadMemorySnapshot)
    return stringValue(input.filePath);
  if (name === BROWSER_TOOL_NAME.cdpLighthouseAudit)
    return compactJoin([
      tab,
      stringValue(input.device),
      stringValue(input.mode),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpScreencastStart)
    return compactJoin([
      tab,
      stringValue(output.filePath) || stringValue(input.filePath),
    ]);
  if (name === BROWSER_TOOL_NAME.cdpScreencastStop) return tab;
  return tab;
}

function cdpInputDetail(tab: string, input: Record<string, unknown>) {
  const operation = stringValue(input.operation || input.action) || "click";
  if (["click", "hover", "doubleClick"].includes(operation))
    return compactJoin([
      tab,
      operation,
      stringValue(input.id),
      pointLabel(input.x, input.y),
    ]);
  if (operation === "key") return compactJoin([tab, stringValue(input.key)]);
  if (operation === "type")
    return compactJoin([tab, truncateValue(input.text)]);
  if (operation === "fill")
    return compactJoin([
      tab,
      stringValue(input.id),
      truncateValue(input.value),
    ]);
  if (operation === "fillForm")
    return compactJoin([tab, arrayCount("fields", input.elements)]);
  if (operation === "drag")
    return compactJoin([
      tab,
      `${pointLabel(input.fromX, input.fromY)} -> ${pointLabel(input.toX, input.toY)}`,
    ]);
  if (operation === "dialog")
    return compactJoin([tab, stringValue(input.action)]);
  return compactJoin([tab, operation]);
}

function cdpPageDetail(
  tab: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const operation = stringValue(input.operation) || "list";
  if (operation === "list")
    return arrayCount("pages", output.pages || output.tabs || output.targets);
  if (operation === "new")
    return stringValue(input.url) || stringValue(output.url);
  if (operation === "navigate")
    return compactJoin([tab, stringValue(input.type), stringValue(input.url)]);
  if (operation === "waitFor")
    return compactJoin([tab, arrayLabel("Text", input.text)]);
  if (operation === "resize")
    return compactJoin([tab, sizeLabel(input.width, input.height)]);
  if (operation === "emulate")
    return compactJoin([
      tab,
      stringValue(input.viewport),
      stringValue(input.colorScheme),
    ]);
  if (operation === "snapshot")
    return compactJoin([tab, outputPreview(output)]);
  return compactJoin([tab, operation]);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function idLabel(label: string, value: unknown) {
  const text =
    stringValue(value) || (Number.isFinite(Number(value)) ? String(value) : "");
  return text ? `${label} ${text}` : "";
}

function arrayLabel(label: string, value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const text = items.map(String).filter(Boolean).join(", ");
  return text ? `${label} ${text}` : "";
}

function arrayCount(label: string, value: unknown) {
  return Array.isArray(value) ? countValue(label, value.length) : "";
}

function countValue(label: string, value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? `${count} ${label}` : "";
}

function pointLabel(x: unknown, y: unknown) {
  return Number.isFinite(Number(x)) && Number.isFinite(Number(y))
    ? `(${Number(x)}, ${Number(y)})`
    : "";
}

function sizeLabel(width: unknown, height: unknown) {
  return Number.isFinite(Number(width)) && Number.isFinite(Number(height))
    ? `${Number(width)} x ${Number(height)}`
    : "";
}

function truncateValue(value: unknown, max = 72) {
  const text = stringValue(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function codeSummary(value: unknown) {
  const text = truncateValue(value, 96);
  if (!text) return "";
  const name = text.match(/function\s+([\w$]+)/)?.[1];
  return name ? `function ${name}()` : text;
}

function outputPreview(output: Record<string, unknown>) {
  const value = "value" in output ? output.value : output.result;
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return truncateValue(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return truncateValue(JSON.stringify(value));
}

function compactJoin(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}
