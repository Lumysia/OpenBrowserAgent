import type { Messages } from "./i18n";
import { languageName } from "./language-name";
import {
  SIDE_PANEL_TASK,
  type SidePanelHandoff,
  type SidePanelHandoffRequest,
} from "./side-panel-handoff";

// Requests the side panel sends to the agent for the context menu and the
// smart bar. The chat shows `content` in the user's language; the agent also
// gets `instruction`, written in English like every other prompt, which says
// how to do it and which language to reply in.

export type SidePanelRequestTask = Extract<
  SidePanelHandoffRequest["task"],
  "summarizePage" | "searchWeb" | "summarizeLink"
>;

export type SidePanelRequest = { content: string; instruction: string };

const TITLE_CHARS = 200;

export function isSidePanelRequest(
  handoff: SidePanelHandoff,
): handoff is SidePanelHandoff & { task: SidePanelRequestTask } {
  return (
    handoff.task === SIDE_PANEL_TASK.summarizePage ||
    handoff.task === SIDE_PANEL_TASK.searchWeb ||
    handoff.task === SIDE_PANEL_TASK.summarizeLink
  );
}

// `attached`: whether the page's tab goes with the message (pages the
// extension cannot read do not).
export function sidePanelRequest(
  handoff: SidePanelHandoff & { task: SidePanelRequestTask },
  t: Messages,
  replyLanguage: string,
  attached: boolean,
): SidePanelRequest {
  const reply = `Reply in ${languageName(replyLanguage)}.`;
  const page = pageReference(handoff, attached);
  const summary =
    "Start with one or two sentences on what it is about, then give the key points as a short list.";
  const menu = t.contextMenu.items;
  switch (handoff.task) {
    case SIDE_PANEL_TASK.summarizePage:
      return {
        content: menu.summarizePage,
        instruction: `Summarize ${page}. Read the page first. ${summary} ${reply}`,
      };
    case SIDE_PANEL_TASK.summarizeLink:
      return {
        content: `${menu.summarizeLink}\n\n${handoff.linkUrl}`,
        instruction: `Summarize the linked page at ${handoff.linkUrl}, a link the user found on ${page}. Read it with its URL; open a tab only if reading gets too little text. ${summary} ${reply}`,
      };
    case SIDE_PANEL_TASK.searchWeb:
      return handoff.text?.trim()
        ? {
            content: `${t.contextMenu.searchSelectionRequest}\n\n${quoteSelection(handoff.text)}`,
            instruction: `Search the web about the text quoted in the message, which the user selected on ${page}. Use the page only to understand what the text refers to. Answer with what you found, citing your sources. ${reply}`,
          }
        : {
            content: menu.searchPage,
            instruction: `Search the web for information related to ${page}. Read the page first to learn its topic, then search for what the page does not give: background, how other sources cover it, recent developments and differing views. Answer with a short overview of what you found, citing your sources. ${reply}`,
          };
  }
}

function pageReference(handoff: SidePanelHandoff, attached: boolean) {
  const title = handoff.pageTitle?.trim().slice(0, TITLE_CHARS);
  const described = [title && `"${title}"`, handoff.pageUrl]
    .filter(Boolean)
    .join(" at ");
  if (attached && handoff.tabId !== undefined)
    return `the page the user is viewing (tab ${handoff.tabId}${described ? `: ${described}` : ""})`;
  return described
    ? `the page the user is viewing (${described}; the extension cannot read this tab, so use its URL if you need its content)`
    : "the page the user is viewing";
}

// The selection as a Markdown quote.
export function quoteSelection(text: string) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}
