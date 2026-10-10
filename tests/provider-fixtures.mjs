import { createServer } from "node:http";
import { once } from "node:events";

// Controlled HTTP protocol fixtures. These are not evidence of a real model run.
export async function providerFixture(handle) {
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      const pathname = new URL(request.url, "http://localhost").pathname;
      const protocol = pathname.includes("streamGenerateContent")
        ? "gemini"
        : pathname.endsWith("/responses")
          ? "openai-responses"
          : pathname.endsWith("/messages")
            ? "anthropic"
            : "openai";
      const item = {
        url: request.url,
        body,
        protocol,
        headers: request.headers,
      };
      requests.push(item);
      await handle(item, response, requests);
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ error: String(error) }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    requests,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export function reply(
  response,
  protocol,
  { text = "", thinking = "", calls = [], end = true } = {},
) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const send = (data, event) =>
    response.write(
      `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`,
    );
  if (protocol === "anthropic") {
    const event = (type, rest = {}) => send({ type, ...rest }, type);
    event("message_start", {
      message: {
        id: "msg_fixture",
        type: "message",
        role: "assistant",
        model: "fixture",
        content: [],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });
    let index = 0;
    if (thinking) {
      event("content_block_start", {
        index,
        content_block: { type: "thinking", thinking: "" },
      });
      event("content_block_delta", {
        index,
        delta: { type: "thinking_delta", thinking },
      });
      event("content_block_delta", {
        index,
        delta: { type: "signature_delta", signature: "fixture-signature" },
      });
      event("content_block_stop", { index: index++ });
    }
    if (text) {
      event("content_block_start", {
        index,
        content_block: { type: "text", text: "" },
      });
      event("content_block_delta", {
        index,
        delta: { type: "text_delta", text },
      });
      event("content_block_stop", { index: index++ });
    }
    for (const call of calls) {
      event("content_block_start", {
        index,
        content_block: {
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: {},
        },
      });
      const json = JSON.stringify(call.args);
      for (const partial_json of [json.slice(0, 5), json.slice(5)])
        event("content_block_delta", {
          index,
          delta: { type: "input_json_delta", partial_json },
        });
      event("content_block_stop", { index: index++ });
    }
    if (end) {
      event("message_delta", {
        delta: {
          stop_reason: calls.length ? "tool_use" : "end_turn",
          stop_sequence: null,
        },
        usage: { output_tokens: 5 },
      });
      event("message_stop");
    }
  } else if (protocol === "gemini") {
    const parts = [
      ...(thinking ? [{ text: thinking, thought: true }] : []),
      ...(text ? [{ text }] : []),
      ...calls.map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.args },
        thoughtSignature: "Zml4dHVyZS1zaWduYXR1cmU=",
      })),
    ];
    send({
      candidates: [
        {
          index: 0,
          content: { role: "model", parts },
          ...(end ? { finishReason: "STOP" } : {}),
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    });
  } else if (protocol === "openai-responses") {
    let sequence_number = 0;
    const event = (type, rest = {}) =>
      send({ type, sequence_number: sequence_number++, ...rest }, type);
    event("response.created", {
      response: { id: "resp_fixture", status: "in_progress", output: [] },
    });
    let index = 0;
    const output = [];
    if (thinking) {
      const item = {
        type: "reasoning",
        id: "rs_fixture",
        summary: [{ type: "summary_text", text: thinking }],
        encrypted_content: "fixture-encrypted",
      };
      event("response.output_item.added", {
        output_index: index,
        item: { ...item, summary: [] },
      });
      event("response.reasoning_summary_part.added", {
        output_index: index,
        summary_index: 0,
        part: { type: "summary_text", text: "" },
      });
      event("response.reasoning_summary_text.delta", {
        output_index: index,
        summary_index: 0,
        delta: thinking,
      });
      event("response.output_item.done", { output_index: index++, item });
      output.push(item);
    }
    if (text) {
      const item = {
        type: "message",
        role: "assistant",
        id: "msg_fixture",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      };
      event("response.output_item.added", {
        output_index: index,
        item: { ...item, content: [] },
      });
      event("response.content_part.added", {
        output_index: index,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      });
      event("response.output_text.delta", {
        output_index: index,
        content_index: 0,
        delta: text,
      });
      event("response.output_item.done", { output_index: index++, item });
      output.push(item);
    }
    for (const call of calls) {
      const item = {
        type: "function_call",
        id: `fc_${call.id}`,
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.args),
        status: "completed",
      };
      event("response.output_item.added", {
        output_index: index,
        item: { ...item, arguments: "" },
      });
      const json = item.arguments;
      for (const delta of [json.slice(0, 5), json.slice(5)])
        event("response.function_call_arguments.delta", {
          output_index: index,
          delta,
        });
      event("response.output_item.done", { output_index: index++, item });
      output.push(item);
    }
    if (end)
      event("response.completed", {
        response: {
          id: "resp_fixture",
          status: "completed",
          output,
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      });
  } else {
    const delta = (value, finish_reason = null) =>
      send({
        id: "chat_fixture",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: value, finish_reason }],
      });
    if (thinking) delta({ reasoning_content: thinking });
    if (text) delta({ content: text });
    calls.forEach((call, index) => {
      const json = JSON.stringify(call.args);
      delta({
        tool_calls: [
          {
            index,
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: json.slice(0, 5) },
          },
        ],
      });
      delta({
        tool_calls: [{ index, function: { arguments: json.slice(5) } }],
      });
    });
    if (end) {
      delta({}, calls.length ? "tool_calls" : "stop");
      send({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
      response.write("data: [DONE]\n\n");
    }
  }
  if (end) response.end();
}

export function toolResults(request) {
  const body = request.body;
  if (request.protocol === "openai-responses")
    return body.input.filter((item) => item.type === "function_call_output");
  if (request.protocol === "gemini")
    return body.contents
      .flatMap((item) => item.parts)
      .filter((part) => part.functionResponse);
  if (request.protocol === "anthropic")
    return body.messages
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .filter((part) => part.type === "tool_result");
  return body.messages.filter((item) => item.role === "tool");
}
