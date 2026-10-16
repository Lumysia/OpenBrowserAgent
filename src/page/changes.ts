import { describe } from "./step-result";
import { CONTROL_CANDIDATES, isHidden, isInteractive } from "./dom";
import { renderLines, snapshotLines } from "./snapshot";
import { beginTexts, textChanges, type PageTexts } from "./text-changes";

// What changed on the page during a batch: interactive elements that
// appeared or went away in the viewport, dialogs, text, and the focused
// control.
let baseline:
  | {
      controls: Set<Element>;
      dialogs: Set<Element>;
      height: number;
      texts: PageTexts;
    }
  | undefined;

const DIALOGS =
  "dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]";
// A dialog that opened is shown as a short snapshot.
const DIALOG_SNAPSHOT = { mode: "page", itemCap: 20, maxChars: 2_000 } as const;
// A height change smaller than this is layout jitter, not content.
const HEIGHT_CHANGE_PX = 40;
// Characters of each new control's line, and controls named when gone.
const LINE_MAX_CHARS = 300;
const GONE_NAMED = 5;
// New controls listed.
const NEW_LISTED = 15;

function visibleControls() {
  return new Set(
    Array.from(document.querySelectorAll(CONTROL_CANDIDATES)).filter(
      (element) => {
        if (!isInteractive(element) || isHidden(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom >= 0 && rect.top <= innerHeight;
      },
    ),
  );
}

function openDialogs() {
  return new Set(
    Array.from(document.querySelectorAll(DIALOGS)).filter(
      (element) => !isHidden(element),
    ),
  );
}

// Whether this document is the one the batch began on.
export function hasBaseline() {
  return !!baseline;
}

export function beginChanges() {
  baseline = {
    controls: visibleControls(),
    dialogs: openDialogs(),
    height: document.documentElement.scrollHeight,
    texts: beginTexts(),
  };
}

export function collectChanges() {
  // No baseline: the document was replaced since the batch began.
  if (!baseline)
    return { lines: [] as string[], notes: [] as string[], fresh: true };
  const before = baseline;
  baseline = undefined;
  const lines: string[] = [];
  const opened = [...openDialogs()].filter(
    (dialog) => !before.dialogs.has(dialog),
  );
  for (const dialog of opened) {
    lines.push(
      "Dialog opened:",
      renderLines(snapshotLines(dialog, DIALOG_SNAPSHOT)),
    );
  }
  const height = document.documentElement.scrollHeight;
  if (Math.abs(height - before.height) > HEIGHT_CHANGE_PX)
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
    for (const element of added.slice(0, NEW_LISTED))
      lines.push(
        ...snapshotLines(element, { mode: "page", maxChars: LINE_MAX_CHARS })
          .lines.slice(0, 1)
          .map((line) => line.text),
      );
    if (added.length > NEW_LISTED)
      lines.push(`- … ${added.length - NEW_LISTED} more (take a snapshot)`);
  }
  if (removed.length)
    lines.push(
      `Gone (${removed.length}): ${removed.slice(0, GONE_NAMED).map(describe).join(", ")}${removed.length > GONE_NAMED ? ", …" : ""}`,
    );
  // An opened dialog is shown whole above.
  const text = textChanges(before.texts, opened);
  lines.push(...text.lines);
  // Notes say where things are, not that the page changed.
  const notes: string[] = [];
  const active = document.activeElement;
  if (active && active !== document.body && isInteractive(active))
    notes.push(
      `Focused: ${snapshotLines(active, { mode: "page", maxChars: LINE_MAX_CHARS }).lines[0]?.text.slice(2) || describe(active)}`,
    );
  notes.push(...text.ticking);
  return { lines, notes, fresh: false };
}
