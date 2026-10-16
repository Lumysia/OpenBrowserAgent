import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ProviderId } from "../src/shared/providers";
import type { RequestReasoning } from "../src/shared/reasoning";

// A task that makes a model reason, call a tool, then reason again over the
// tool's result. scripts/record-reasoning-fixtures.ts records a live
// endpoint's replies to it; tests/reasoning-replay.test.ts replays them.

export const REASONING_PROMPT =
  "Among Lima, Paris, Berlin and Oslo, pick the city whose letters' alphabet positions (A=1 … Z=26) add up to a prime (reason it out), then call get_weather for that city. " +
  "From its hourly result, work out the 3-hour window with the highest average temperature in which the wind stays under 20 km/h, and answer in one sentence.";

export const WEATHER_RESULT = JSON.stringify({
  hours: ["09", "10", "11", "12", "13", "14", "15"],
  temp_c: [14, 17, 21, 23, 22, 19, 16],
  wind_kmh: [5, 8, 12, 25, 30, 18, 9],
});

export function weatherTool(onCall?: (city: string) => void): AgentTool {
  return {
    name: "get_weather",
    label: "get_weather",
    description: "Hourly weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    } as AgentTool["parameters"],
    execute: async (_id, args) => {
      onCall?.((args as { city: string }).city);
      return { content: [{ type: "text", text: WEATHER_RESULT }], details: {} };
    },
  };
}

// One recorded run: the endpoint's reply to each model request, as sent.
export type ReasoningRecording = {
  provider: ProviderId;
  model: string;
  reasoning: RequestReasoning;
  recorded: string;
  replies: string[];
};
