import { ExternalLink, Search } from "lucide-react";
import React from "react";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";

export type ToolReference = {
  title: string;
  url?: string;
  icon: React.ReactNode;
};

export function toolReferences(
  name: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const references: ToolReference[] = [];
  if (
    name === BROWSER_TOOL_NAME.openNewTabWithURL &&
    output.tab &&
    typeof output.tab === "object"
  ) {
    const tab = output.tab as { title?: string; url?: string };
    if (tab.title)
      references.push({
        title: tab.title,
        url: tab.url,
        icon: <ExternalLink size={14} />,
      });
    return references;
  }
  if (
    name === BROWSER_TOOL_NAME.getTabContent &&
    Array.isArray(output.contents)
  ) {
    return output.contents
      .map((item) => item as { title?: string; url?: string })
      .filter((item) => item.title)
      .map((item) => ({
        title: item.title || "",
        url: item.url,
        icon: <ExternalLink size={14} />,
      }));
  }
  if (
    name === BROWSER_TOOL_NAME.openSearchTab &&
    typeof input.query === "string"
  )
    references.push({ title: input.query, icon: <Search size={14} /> });
  return references;
}
