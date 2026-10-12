import { normalizeAgents, resolveAgent } from "../../shared/agents";
import { storage } from "../../shared/storage";
import { TOOL_NAME } from "../../shared/tool-names";
import { runSubAgentChat } from "../sub-agent-run";
import { fail, schema, stringArg, type ToolDefinition } from "./types";

// Answers longer than this come back summarized by the helper model, with
// the full answer stored for read.
const RESULT_MAX_CHARS = 3_000;

const SUMMARY_SYSTEM =
  "You condense a sub-agent's report for the agent that delegated the task. Keep every fact, number, name, URL and open question; drop narration. At most 350 words.";

export const subAgentTool: ToolDefinition = {
  name: TOOL_NAME.subAgent,
  group: "subAgents",
  onDemand: true,
  parallel: true,
  available: (run) => run.depth === 0,
  summary: "Delegate a self-contained task to a sub-agent",
  description:
    "Give a self-contained task to a sub-agent that works in its own chat (with its own context) and returns its answer. Write the task with all details it needs; it cannot see this chat, but it can read stored outputs (art-…) you name. Several sub-agents run in parallel when called in the same turn.",
  parameters: schema(
    {
      task: { type: "string" },
      agent: {
        type: "string",
        description: "Agent name or id. Defaults to the current agent.",
      },
      title: { type: "string", description: "Short title for its chat." },
    },
    ["task"],
  ),
  async execute(input, { run, toolCallId, messageId, signal, progress }) {
    const task = stringArg(input.task);
    if (!task) return fail("task is required.");
    const agents = normalizeAgents(await storage.agents.get());
    const wanted = stringArg(input.agent).toLowerCase();
    const agent = wanted
      ? agents.find(
          (item) => item.id === wanted || item.name.toLowerCase() === wanted,
        )
      : resolveAgent(agents, run.agent.id);
    if (!agent)
      return fail(
        `No agent "${input.agent}". Agents: ${agents.map((item) => item.name).join(", ")}.`,
      );
    const title = (stringArg(input.title) || task.replace(/\s+/g, " ")).slice(
      0,
      80,
    );
    const details = {
      state: "running",
      title,
      agentId: agent.id,
      agentName: agent.name,
      task,
    };
    let childChatId = "";
    const result = await runSubAgentChat({
      agent,
      task,
      title,
      parent: { chatId: run.chatId, messageId, toolCallId },
      onStart: (chatId) => {
        childChatId = chatId;
        progress({ ...details, childChatId });
      },
      onProgress: (items) =>
        progress({ ...details, childChatId, progress: items }),
      signal,
    });
    if (result.usage) run.addUsage(result.usage);
    signal?.throwIfAborted();
    const finished = {
      ...details,
      state: result.error ? "failed" : "completed",
      childChatId: result.chatId,
    };
    if (result.error && !result.answer)
      return fail(`Sub-agent "${title}" failed: ${result.error}`, finished);
    let text = result.answer || "(no answer)";
    if (text.length > RESULT_MAX_CHARS) {
      const handle = await run.storeArtifact(
        `sub-agent answer: ${title}`,
        text,
      );
      const summary = await run.askHelper(SUMMARY_SYSTEM, text, signal);
      text = `${summary.trim()}\n[Summary of a ${result.answer.length}-character answer; the full answer is "${handle}" (use read).]`;
    }
    return {
      text: `Sub-agent "${title}" (${agent.name}) ${result.error ? `stopped: ${result.error}` : "finished"}.\n${text}`,
      details: finished,
    };
  },
};
