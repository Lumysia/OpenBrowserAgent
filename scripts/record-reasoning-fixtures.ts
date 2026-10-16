// Records how a live endpoint streams reasoning around a tool call, for
// tests/reasoning-replay.test.ts: the extension's own request path (Pi's
// agent loop through createProviderStream) runs tests/reasoning-scenario.ts,
// and each reply's raw stream is saved. Not part of the test suite (it uses
// the network and an API key); run it when a provider's stream changes:
//
//   OBA_LIVE_API_KEY=... npx tsx scripts/record-reasoning-fixtures.ts \
//     <provider type> <base URL> <model> [effort] [fixture name]
//
// The key is read from the environment only and never written. Opaque
// replay tokens (signatures, encrypted reasoning) are shortened.
import { mkdir, writeFile } from "node:fs/promises";
import { Agent } from "@earendil-works/pi-agent-core";
import { createProviderStream, piModel } from "../src/background/pi-provider";
import { isProviderId } from "../src/shared/providers";
import {
  REASONING_EFFORT,
  type ReasoningEffort,
} from "../src/shared/reasoning";
import {
  REASONING_PROMPT,
  weatherTool,
  type ReasoningRecording,
} from "../tests/reasoning-scenario";

const [provider, baseUrl, modelName, effort = REASONING_EFFORT.default, name] =
  process.argv.slice(2);
const apiKey = process.env.OBA_LIVE_API_KEY;
if (!isProviderId(provider) || !baseUrl || !modelName || !apiKey) {
  console.error(
    "Usage: OBA_LIVE_API_KEY=... record-reasoning-fixtures.ts <provider> <base URL> <model> [effort] [name]",
  );
  process.exit(1);
}
const config = { provider, apiKey, baseUrl, modelName };

const OPAQUE_KEYS = new Set([
  "encrypted_content",
  "signature",
  "thoughtSignature",
  "data",
]);
// Long enough to stay valid base64 (a multiple of 4).
const OPAQUE_LENGTH = 48;
// What a server echoes of its own setup or the account (its system
// instructions, user and cache ids), which no client reads.
const SERVER_KEYS = new Set([
  "instructions",
  "safety_identifier",
  "prompt_cache_key",
  "user",
]);

function shorten(value: unknown, key = ""): unknown {
  if (typeof value === "string")
    return OPAQUE_KEYS.has(key) && value.length > OPAQUE_LENGTH
      ? value.slice(0, OPAQUE_LENGTH)
      : value;
  if (Array.isArray(value)) return value.map((item) => shorten(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).flatMap(([inner, item]) =>
        SERVER_KEYS.has(inner) && typeof item !== "object"
          ? []
          : [[inner, shorten(item, inner)]],
      ),
    );
  return value;
}

function shortenStream(text: string) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.startsWith("data:")) return line;
      try {
        return `data: ${JSON.stringify(shorten(JSON.parse(line.slice(5))))}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

// Whether a model reasons in a turn is its own choice; a run is kept when
// it reasoned in every turn, else the last of these runs.
const ATTEMPTS = 3;

async function record() {
  const replies: string[] = [];
  const send = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await send(input, init);
    if (!(response.headers.get("content-type") || "").includes("event-stream"))
      return response;
    const text = await response.text();
    replies.push(shortenStream(text));
    return new Response(text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const calls: string[] = [];
  const agent = new Agent({
    streamFn: createProviderStream(config, effort as ReasoningEffort),
    initialState: {
      model: piModel(config),
      tools: [weatherTool((city) => calls.push(city))],
    },
  });
  try {
    await agent.prompt(REASONING_PROMPT);
  } finally {
    globalThis.fetch = send;
  }
  const turns = agent.state.messages.flatMap((message) =>
    message.role === "assistant" ? [message.content] : [],
  );
  console.log({
    error: agent.state.errorMessage,
    calls,
    turns: turns.map((content) =>
      content
        .map((part) =>
          part.type === "thinking"
            ? `thinking(${part.thinking.length})`
            : part.type === "text"
              ? `text(${part.text.length})`
              : part.type,
        )
        .join(" "),
    ),
  });
  const reasoned = turns.every((content) =>
    content.some((part) => part.type === "thinking" && part.thinking.trim()),
  );
  return { replies, reasoned: reasoned && turns.length > 1 };
}

let run = await record();
for (let attempt = 1; attempt < ATTEMPTS && !run.reasoned; attempt++)
  run = await record();
const { replies } = run;

const recording: ReasoningRecording = {
  provider,
  model: modelName,
  reasoning: effort as ReasoningEffort,
  recorded: new Date().toISOString().slice(0, 10),
  replies,
};
const directory = new URL("../tests/fixtures/reasoning/", import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL(`${name || provider}.json`, directory);
await writeFile(file, `${JSON.stringify(recording, null, 2)}\n`);
console.log(`Saved ${replies.length} replies to ${file.pathname}`);
