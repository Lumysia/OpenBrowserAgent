import { ExternalLink, Search } from "lucide-react";
import React from "react";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import { TOOL_NAME } from "../../src/shared/tool-names";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";

export type ToolReference = {
  title: string;
  url?: string;
  icon: React.ReactNode;
  // Runs instead of opening `url`.
  action?: () => void;
  // The accessible name when the title alone does not say what happens.
  label?: string;
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

export function ToolReferenceButton({
  reference,
  index,
}: {
  reference: ToolReference;
  index: number;
}) {
  const { url, action, label } = reference;
  const button = (
    <Button
      variant="ghost"
      onClick={
        action ||
        (url ? () => openOrFocusUrl(url).catch(console.warn) : undefined)
      }
      aria-label={label}
      style={{ "--tool-reference-index": index } as React.CSSProperties}
    >
      {reference.icon}
      <span>{reference.title}</span>
    </Button>
  );
  if (!label) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
