import { trimBlankLines } from "../../shared/format";
import { cn } from "../utils";

// User-typed plain text: keeps the user's line breaks and wraps long words.
export function UserText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn("ui-user-text ui-selectable", className)}>
      {trimBlankLines(text)}
    </span>
  );
}
