import { withContentSlice, withListSlice } from "./tool-utils";

export function sliceInspectablePageOutput(
  output: unknown,
  args: Record<string, unknown>,
) {
  if (
    !output ||
    typeof output !== "object" ||
    !Array.isArray((output as { pages?: unknown[] }).pages)
  )
    return output;
  return {
    pages: (output as { pages: Array<Record<string, unknown>> }).pages.map(
      (page) => ({
        ...withContentSlice(
          page,
          String(page.markdown || ""),
          { offset: args.textOffset, limit: args.textLimit },
          "markdown",
        ),
        ...sliceLists(page, args),
      }),
    ),
  };
}

function sliceLists(
  page: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const itemArgs = {
    offset: args.itemOffset ?? args.offset,
    limit: args.itemLimit,
  };
  return {
    ...(Array.isArray(page.elements)
      ? withListSlice({}, page.elements, itemArgs, "elements")
      : {}),
    ...(Array.isArray(page.images)
      ? withListSlice({}, page.images, itemArgs, "images")
      : {}),
    ...(Array.isArray(page.links)
      ? withListSlice({}, page.links, itemArgs, "links")
      : {}),
    ...(Array.isArray(page.forms)
      ? withListSlice({}, page.forms, itemArgs, "forms")
      : {}),
    ...(Array.isArray(page.blocks)
      ? withListSlice({}, page.blocks, itemArgs, "blocks")
      : {}),
  };
}
