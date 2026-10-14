// The AI engine's batch format: every item is headed by its own `[[n]]` line
// and the list ends with `[[end]]`.
//
//   [[1]]
//   First paragraph
//   [[2]]
//   Second paragraph
//   [[end]]
//
// Items are matched by number, never by position, so a model that drops,
// merges or reorders items can't put a translation under the wrong
// paragraph. The parser reads a stream: an item is complete when the next
// header arrives.

export const END_MARKER = "[[end]]";

export function markItems(items: Array<{ id: number; text: string }>) {
  return [
    ...items.flatMap((item) => [`[[${item.id}]]`, item.text]),
    END_MARKER,
  ].join("\n");
}

const HEADER = /^\s*\[\[\s*(\d+|end)\s*\]\]\s*(.*)$/i;
const FENCE = /^\s*```/;

export type MarkedItem = { id: number; text: string };

export function createMarkedStreamParser() {
  let buffer = "";
  let current: { id: number; lines: string[] } | undefined;
  let ended = false;
  const done = new Set<number>();

  const finish = (): MarkedItem[] => {
    const item = current;
    current = undefined;
    if (!item || done.has(item.id)) return [];
    const text = item.lines.join("\n").trim();
    if (!text) return [];
    done.add(item.id);
    return [{ id: item.id, text }];
  };

  const line = (value: string): MarkedItem[] => {
    if (ended || FENCE.test(value)) return [];
    const header = HEADER.exec(value);
    if (header) {
      const completed = finish();
      if (header[1].toLowerCase() === "end") ended = true;
      else
        current = {
          id: Number(header[1]),
          lines: header[2] ? [header[2]] : [],
        };
      return completed;
    }
    // Text before the first header is the model talking; it is dropped.
    current?.lines.push(value);
    return [];
  };

  return {
    // Completed items in `delta`.
    push(delta: string): MarkedItem[] {
      buffer += delta;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      return lines.flatMap(line);
    },
    // The rest, when the stream ends (with or without `[[end]]`).
    end(): MarkedItem[] {
      const rest = buffer;
      buffer = "";
      return [...(rest ? line(rest) : []), ...(ended ? [] : finish())];
    },
    // The item being written, for showing it as it arrives.
    partial(): MarkedItem | undefined {
      if (ended || !current || done.has(current.id)) return undefined;
      const tail = /^\s*(\[|`)/.test(buffer) ? "" : buffer;
      const text = [...current.lines, tail].join("\n").trim();
      return text ? { id: current.id, text } : undefined;
    },
  };
}
