import { getBrowserApi } from "../../shared/storage";
import { TOOL_NAME } from "../../shared/tool-names";
import { RUN_TAB_ID_PARAM } from "../run-tab";
import { pageHeader } from "./page";
import { callPage, pageTab } from "../page-agent";
import { errorMessage, fail, schema, type ToolDefinition } from "./types";

const MAX_EDITS = 100;

const EDIT_OPS = [
  "setText",
  "insert",
  "remove",
  "setAttribute",
  "removeAttribute",
  "style",
  "css",
];

type Edit = Record<string, unknown> & { op: string };

export const editPageTool: ToolDefinition = {
  name: TOOL_NAME.editPage,
  group: "browser",
  compactArgs: true,
  summary: "Change page content and style",
  description:
    "Edit the page in place by snapshot ref, in one batch: setText (text; keep links by writing them as [label](e12) like the snapshot), insert (text or plain html at position before/after/prepend/append; tag optional; returns the new ref; no script, frames, SVG or event handlers), remove, setAttribute / removeAttribute (name, value), style (inline CSS in value), css (stylesheet text in value, no ref). For translation, replace each block's text with setText. Stops at the first failing edit.",
  parameters: schema(
    {
      tabId: RUN_TAB_ID_PARAM,
      edits: {
        type: "array",
        minItems: 1,
        items: schema(
          {
            op: { type: "string", enum: EDIT_OPS },
            ref: { type: "string" },
            text: { type: "string" },
            html: { type: "string" },
            position: {
              type: "string",
              enum: ["before", "after", "prepend", "append"],
            },
            tag: { type: "string" },
            name: { type: "string" },
            value: { type: "string" },
          },
          ["op"],
        ),
      },
    },
    ["edits"],
  ),
  async execute(input, { run, signal }) {
    const edits = (Array.isArray(input.edits) ? input.edits : []).filter(
      (edit): edit is Edit =>
        !!edit &&
        typeof edit === "object" &&
        typeof (edit as Edit).op === "string",
    );
    if (!edits.length)
      return fail(
        "edits is required: a list like [{op:'setText', ref:'e12', text:'…'}].",
      );
    if (edits.length > MAX_EDITS)
      return fail(`At most ${MAX_EDITS} edits per call; split the batch.`);
    const tab = await pageTab(run.tab, input.tabId);
    let applied = 0;
    const inserted: string[] = [];
    let error = "";
    // Page edits run in the page; stylesheet edits through the extension API,
    // keeping the batch order.
    for (let start = 0; start < edits.length && !error;) {
      const edit = edits[start];
      if (edit.op === "css") {
        const css = String(edit.value ?? edit.text ?? "");
        try {
          await getBrowserApi().scripting.insertCSS({
            target: { tabId: tab.id },
            css,
          });
          applied++;
        } catch (cause) {
          error = `Edit ${start + 1} (css) failed: ${errorMessage(cause)}`;
        }
        start++;
        continue;
      }
      let end = start;
      while (end < edits.length && edits[end].op !== "css") end++;
      const { value } = await callPage<{
        applied: number;
        inserted: string[];
        error?: string;
      }>(tab.id, "edits", { ops: edits.slice(start, end) }, signal);
      applied += value.applied;
      inserted.push(...value.inserted);
      if (value.error)
        error = value.error.replace(
          /^Edit (\d+)/,
          (_, n) => `Edit ${start + Number(n)}`,
        );
      start = end;
    }
    const lines = [
      pageHeader(tab),
      `Applied ${applied} of ${edits.length} edits.`,
    ];
    if (inserted.length) lines.push(`Inserted: ${inserted.join(", ")}`);
    if (error) lines.push(`${error} Later edits were not applied.`);
    return {
      text: lines.join("\n"),
      details: {
        tabId: tab.id,
        title: tab.title,
        edits: edits.length,
        applied,
        ...(error ? { error } : {}),
      },
      isError: !!error,
    };
  },
};
