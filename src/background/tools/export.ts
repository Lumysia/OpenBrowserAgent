import { MARKDOWN_FILENAME_MAX_LENGTH } from "../../shared/config";
import { TOOL_NAME } from "../../shared/tool-names";
import { downloadTextFile, findImages, safeFileName } from "../downloads";
import { callPage, pageTab } from "../page-agent";
import {
  fail,
  json,
  ok,
  schema,
  stringArg,
  type ToolDefinition,
} from "./types";

export const exportTool: ToolDefinition = {
  name: TOOL_NAME.export,
  group: "browser",
  onDemand: true,
  summary: "Download a tab as a Markdown file or its images as a zip",
  description:
    "Save files to the user's device: markdown (the tab's text as a .md file) or images (the tab's images as a .zip). This does not give you the content; use read for that.",
  parameters: schema(
    {
      action: { type: "string", enum: ["markdown", "images"] },
      tabId: { type: "number", description: "Defaults to the active tab." },
    },
    ["action"],
  ),
  async execute(input, { signal }) {
    const tab = await pageTab(input.tabId);
    const action = stringArg(input.action);
    if (action === "images") return json(await findImages(tab.id, signal));
    if (action !== "markdown")
      return fail('action must be "markdown" or "images".');
    const { value, title, url } = await callPage<{ text: string }>(
      tab.id,
      "markdown",
      {},
      signal,
    );
    const filename = `${safeFileName(title || url || "tab").slice(0, MARKDOWN_FILENAME_MAX_LENGTH)}.md`;
    await downloadTextFile(
      filename,
      `# ${title}\n\nURL: ${url}\n\n${value.text}`,
      "text/markdown;charset=utf-8",
      signal,
    );
    return ok(`Downloaded ${filename}.`, { filename, tabId: tab.id });
  },
};
