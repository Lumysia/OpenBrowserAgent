import { TOOL_ERROR } from "../shared/tool-errors";

type SendCommand = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export async function navigateCdpPage(
  args: Record<string, unknown>,
  send: SendCommand,
) {
  const type = String(args.type || (args.url ? "url" : "reload"));
  if (type === "back" || type === "forward") {
    const history = (await send("Page.getNavigationHistory")) as {
      currentIndex: number;
      entries: Array<{ id: number }>;
    };
    const entry =
      history.entries[history.currentIndex + (type === "back" ? -1 : 1)];
    if (!entry)
      return {
        success: false,
        type,
        error: "No navigation history entry in that direction",
      };
    await send("Page.navigateToHistoryEntry", { entryId: entry.id });
  } else if (type === "url") {
    const url = String(args.url || "").trim();
    if (!url) return { success: false, type, error: TOOL_ERROR.missingUrl };
    const result = await send("Page.navigate", { url });
    if (result.errorText)
      return { success: false, type, error: String(result.errorText) };
  } else if (type === "reload") {
    await send("Page.reload", { ignoreCache: args.ignoreCache === true });
  } else {
    return { success: false, type, error: TOOL_ERROR.unknownNavigationType };
  }
  return { success: true, type };
}
