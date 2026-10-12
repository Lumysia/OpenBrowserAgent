import { describe } from "./actions";
import { isHidden, isInteractive } from "./dom";
import { snapshotLines } from "./snapshot";

// What changed on the page during a batch: interactive elements that
// appeared or went away in the viewport, dialogs, and the focused control.
let baseline:
  { controls: Set<Element>; dialogs: Set<Element>; height: number } | undefined;

const CANDIDATES =
  "a[href],button,input,select,textarea,summary,[role],[contenteditable],[tabindex],[onclick]";
const DIALOGS =
  "dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]";

function visibleControls() {
  return new Set(
    Array.from(document.querySelectorAll(CANDIDATES)).filter((element) => {
      if (!isInteractive(element) || isHidden(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= innerHeight;
    }),
  );
}

function openDialogs() {
  return new Set(
    Array.from(document.querySelectorAll(DIALOGS)).filter(
      (element) => !isHidden(element),
    ),
  );
}

export function beginChanges() {
  baseline = {
    controls: visibleControls(),
    dialogs: openDialogs(),
    height: document.documentElement.scrollHeight,
  };
}

export function collectChanges(limit = 15) {
  // No baseline: the document was replaced since the batch began.
  if (!baseline) return { lines: [] as string[], fresh: true };
  const before = baseline;
  baseline = undefined;
  const lines: string[] = [];
  for (const dialog of openDialogs())
    if (!before.dialogs.has(dialog)) {
      const { lines: dialogLines } = snapshotLines(dialog, {
        mode: "page",
        itemCap: 20,
        maxChars: 2_000,
      });
      lines.push(
        "Dialog opened:",
        ...dialogLines.map((line) => `${"  ".repeat(line.depth)}${line.text}`),
      );
    }
  const height = document.documentElement.scrollHeight;
  if (Math.abs(height - before.height) > 40)
    lines.push(
      `Page height ${before.height} → ${height}px (content ${height > before.height ? "added" : "removed"}).`,
    );
  const now = visibleControls();
  const added = [...now].filter((element) => !before.controls.has(element));
  const removed = [...before.controls].filter(
    (element) =>
      !now.has(element) && (!element.isConnected || isHidden(element)),
  );
  if (added.length) {
    lines.push(`New in view (${added.length}):`);
    for (const element of added.slice(0, limit))
      lines.push(
        ...snapshotLines(element, { mode: "page", maxChars: 300 })
          .lines.slice(0, 1)
          .map((line) => line.text),
      );
    if (added.length > limit)
      lines.push(`- … ${added.length - limit} more (take a snapshot)`);
  }
  if (removed.length)
    lines.push(
      `Gone (${removed.length}): ${removed.slice(0, 5).map(describe).join(", ")}${removed.length > 5 ? ", …" : ""}`,
    );
  const active = document.activeElement;
  if (active && active !== document.body && isInteractive(active))
    lines.push(
      `Focused: ${snapshotLines(active, { mode: "page", maxChars: 300 }).lines[0]?.text.slice(2) || describe(active)}`,
    );
  return { lines, fresh: false };
}
