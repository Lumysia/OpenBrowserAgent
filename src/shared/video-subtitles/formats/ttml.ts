// TTML / DFXP / IMSC (https://www.w3.org/TR/ttml2/): each timed `<p>` is a
// cue. Read with patterns rather than an XML parser so it runs anywhere;
// timing inherited from a parent `<div>` or `<body>` is not applied.
import { clockSeconds, finishCues, plainCueText, type Cue } from "../cues";

const ROOT = /<(?:[\w-]+:)?tt[\s>]/;
const PARAGRAPH = /<((?:[\w-]+:)?p)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;

export function looksLikeTtml(text: string) {
  const head = text.slice(0, 2000);
  return ROOT.test(head) && /xmlns(?::\w+)?=["'][^"']*ttml/i.test(head);
}

type Rates = { frame: number; tick: number };

export function parseTtml(text: string): Cue[] {
  const root = ROOT.exec(text);
  const rootTag = root
    ? text.slice(root.index, text.indexOf(">", root.index))
    : "";
  const frame = Number(attribute(rootTag, "frameRate")) || 30;
  const rates: Rates = {
    frame,
    tick: Number(attribute(rootTag, "tickRate")) || frame || 1,
  };
  const cues: Cue[] = [];
  for (const match of text.matchAll(PARAGRAPH)) {
    const attributes = match[2] ?? "";
    const body = match[3];
    if (!body) continue;
    const start = timeExpression(attribute(attributes, "begin"), rates);
    if (start === undefined) continue;
    const end =
      timeExpression(attribute(attributes, "end"), rates) ??
      addDuration(start, timeExpression(attribute(attributes, "dur"), rates));
    if (end === undefined) continue;
    // Line breaks in the source are spacing, `<br/>` is a line break.
    cues.push({
      start,
      end,
      text: plainCueText(body.replace(/\s*\r?\n\s*/g, " ")),
    });
  }
  return finishCues(cues);
}

function addDuration(start: number, duration: number | undefined) {
  return duration === undefined ? undefined : start + duration;
}

// An attribute's value by its local name (`ttp:tickRate` as `tickRate`).
function attribute(tag: string, name: string) {
  const match = new RegExp(
    `(?:^|\\s)(?:[\\w-]+:)?${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
  ).exec(tag);
  return match ? (match[2] ?? match[3]) : undefined;
}

// A TTML time expression in seconds: a clock time (`00:01:02.5`, or with
// frames `00:01:02:12`) or an offset (`1.5s`, `1500ms`, `2m`, `30f`,
// `10000t`).
export function timeExpression(
  value: string | undefined,
  rates: Rates,
): number | undefined {
  if (!value) return undefined;
  const frames = /^\s*(\d+):(\d{2}):(\d{2}):(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (frames)
    return (
      Number(frames[1]) * 3600 +
      Number(frames[2]) * 60 +
      Number(frames[3]) +
      Number(frames[4]) / rates.frame
    );
  const clock = /^\s*(\d+):(\d{2}):(\d{2})(\.\d+)?\s*$/.exec(value);
  if (clock)
    return (
      Number(clock[1]) * 3600 +
      Number(clock[2]) * 60 +
      Number(clock[3]) +
      Number(clock[4] ?? 0)
    );
  const offset = /^\s*(\d+(?:\.\d+)?)(h|m|s|ms|f|t)\s*$/.exec(value);
  if (!offset) return clockSeconds(value);
  const amount = Number(offset[1]);
  switch (offset[2]) {
    case "h":
      return amount * 3600;
    case "m":
      return amount * 60;
    case "ms":
      return amount / 1000;
    case "f":
      return amount / rates.frame;
    case "t":
      return amount / rates.tick;
    default:
      return amount;
  }
}
