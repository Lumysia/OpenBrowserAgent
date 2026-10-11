import { clsx, type ClassValue } from "clsx";

// The UI uses its own CSS classes, not Tailwind, so classes are joined as-is.
// tailwind-merge used to drop names like `accent-dot` as Tailwind conflicts.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
