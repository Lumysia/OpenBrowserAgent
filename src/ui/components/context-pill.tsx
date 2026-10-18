import * as React from "react";
import { cn } from "../utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// One line of context that goes with a message (a tab, a file, selected
// text, an element): an icon on a soft tile and a title cut with an
// ellipsis; the rest (full title, address, size, state) is in the tooltip.
// With `onClick` it is a button, otherwise plain text.
export function ContextPill({
  icon,
  imageSrc,
  imageFill = false,
  label,
  tooltip,
  unavailable = false,
  onClick,
  className,
  ...props
}: {
  // Shown when there is no image, or it fails to load.
  icon?: React.ReactNode;
  // A favicon (sits on the tile) or, with `imageFill`, a thumbnail.
  imageSrc?: string;
  imageFill?: boolean;
  label: React.ReactNode;
  tooltip: React.ReactNode;
  unavailable?: boolean;
  onClick?: () => void;
  className?: string;
} & Pick<React.AriaAttributes, "aria-label">) {
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [imageSrc]);
  const media =
    imageSrc && !imageFailed ? (
      <img
        src={imageSrc}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    ) : (
      icon
    );
  const content = (
    <>
      {media && (
        <span
          className="ui-context-pill-icon"
          data-fill={imageFill && imageSrc && !imageFailed ? "" : undefined}
          aria-hidden
        >
          {media}
        </span>
      )}
      <span className="ui-context-pill-label">{label}</span>
    </>
  );
  const shared = {
    className: cn("ui-context-pill", className),
    "data-unavailable": unavailable ? "" : undefined,
    ...props,
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onClick ? (
          <button type="button" onClick={onClick} {...shared}>
            {content}
          </button>
        ) : (
          <span {...shared}>{content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// Pills in a row that wraps, on the side given by the parent's alignment.
export function ContextPillList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-context-pill-list", className)} {...props} />;
}
