import { ExternalLink, Search } from "lucide-react";
import React from "react";
import { TOOL_NAME } from "../../src/shared/tool-names";

export type ToolReference = {
  title: string;
  url?: string;
  icon: React.ReactNode;
};

// Pages a tool worked on, as links under its part.
export function toolReferences(
  name: string,
  output: Record<string, unknown>,
): ToolReference[] {
  if (name === TOOL_NAME.webSearch && Array.isArray(output.results))
    return (output.results as Array<{ title?: string; url?: string }>)
      .filter((result) => result.title)
      .map((result) => ({
        title: result.title!,
        url: result.url,
        icon: <Search size={14} />,
      }));
  const title = typeof output.title === "string" ? output.title : "";
  const url = typeof output.url === "string" ? output.url : "";
  return title && url && /^https?:/.test(url)
    ? [{ title, url, icon: <ExternalLink size={14} /> }]
    : [];
}
