import { isToolPartType, toolStateRank, type ChatPart } from "./types";

// Picks a text part's text from its two versions.
export type PartTextRule = (earlier: ChatPart, later: ChatPart) => string;

// How two versions of one chat part combine. Both the live stream
// (applyPart: the update that just came in) and two stored copies of a
// running message (chats.ts: the copy that got further) use these rules;
// only how text combines differs between them.
// - A different type means a different part: the later one replaces it.
// - Fields the later version leaves out keep their earlier value.
// - A tool's state never goes back.
export function mergePart(
  earlier: ChatPart,
  later: ChatPart,
  text: PartTextRule,
): ChatPart {
  if (earlier.type !== later.type) return later;
  const merged = { ...earlier, ...definedFields(later) };
  if (isTextPart(earlier)) return { ...merged, text: text(earlier, later) };
  if (isToolPartType(earlier.type))
    return { ...merged, state: laterToolState(earlier.state, later.state) };
  return merged;
}

// The live stream: deltas append, anything else replaces the text it has.
export const streamedText: PartTextRule = (earlier, later) =>
  later.append
    ? `${earlier.text || ""}${later.text || ""}`
    : later.text || earlier.text || "";

// Two copies of one streamed part: the longer text has got further.
export const longerText: PartTextRule = (earlier, later) => {
  const a = earlier.text || "";
  const b = later.text || "";
  return a.length > b.length ? a : b;
};

function isTextPart(part: ChatPart) {
  return part.type === "text" || part.type === "reasoning";
}

function laterToolState(
  earlier: ChatPart["state"],
  later: ChatPart["state"],
): ChatPart["state"] {
  if (!later) return earlier;
  return toolStateRank(earlier) > toolStateRank(later) ? earlier : later;
}

// `append` says how to apply a streamed delta; it is not kept on the part.
function definedFields(part: ChatPart) {
  return Object.fromEntries(
    Object.entries(part).filter(
      ([key, value]) => value !== undefined && key !== "append",
    ),
  ) as Partial<ChatPart>;
}
