import { SKILL_ENTRY_PATH } from "../../shared/skills";

// How tools name what they read and save: "tab" (the run's tab) or
// "tab:ID", a stored output "art-…", a URL, "attachment:ID", "skill:NAME"
// or "skill:NAME/PATH", and "workspace:PATH". Handles are written and
// parsed only here.

const PREFIX = {
  tab: "tab:",
  artifact: "art-",
  attachment: "attachment:",
  skill: "skill:",
  workspace: "workspace:",
} as const;

const RUN_TAB_SOURCE = "tab";

export type Source =
  | { kind: "tab"; tabId?: number }
  | { kind: "artifact"; handle: string }
  | { kind: "url"; url: string }
  | { kind: "attachment"; id: string }
  | { kind: "skill"; name: string; path: string }
  | { kind: "workspace"; path: string };

export const tabSource = (tabId: number) => `${PREFIX.tab}${tabId}`;
export const newArtifactHandle = () =>
  `${PREFIX.artifact}${crypto.randomUUID().slice(0, 8)}`;
export const attachmentSource = (id: string) => `${PREFIX.attachment}${id}`;
export const skillSource = (name: string, path?: string) =>
  `${PREFIX.skill}${name}${path ? `/${path}` : ""}`;
export const workspaceSource = (path: string) => `${PREFIX.workspace}${path}`;

// The path in "workspace:PATH" (or a bare path).
export function workspaceSourcePath(value: string) {
  return value.startsWith(PREFIX.workspace)
    ? value.slice(PREFIX.workspace.length)
    : value;
}

// What a source argument names; a bare id is an attachment.
export function parseSource(value: string): Source {
  if (!value || value === RUN_TAB_SOURCE) return { kind: "tab" };
  if (value.startsWith(PREFIX.tab) && /^\d+$/.test(rest(value, PREFIX.tab)))
    return { kind: "tab", tabId: Number(rest(value, PREFIX.tab)) };
  if (value.startsWith(PREFIX.artifact))
    return { kind: "artifact", handle: value };
  if (/^(https?:|data:)/i.test(value)) return { kind: "url", url: value };
  if (value.startsWith(PREFIX.skill)) {
    const [name, ...path] = rest(value, PREFIX.skill).split("/");
    return { kind: "skill", name, path: path.join("/") || SKILL_ENTRY_PATH };
  }
  if (value.startsWith(PREFIX.workspace))
    return { kind: "workspace", path: workspaceSourcePath(value) };
  return {
    kind: "attachment",
    id: value.startsWith(PREFIX.attachment)
      ? rest(value, PREFIX.attachment)
      : value,
  };
}

function rest(value: string, prefix: string) {
  return value.slice(prefix.length);
}

// The handles a file can be saved from, for tool descriptions and errors.
export const SAVE_SOURCES_HELP = `"tab" or "tab:ID" (the page as Markdown), "art-…", "workspace:PATH" or "attachment:ID"`;
