import type { Messages } from "../shared/i18n";
import {
  findMcpServerPreset,
  type McpServerPreset,
} from "../shared/mcp-presets";
import type { McpServerConfig } from "../shared/types";

// A preset's description in the UI language.
export function mcpPresetDescription(preset: McpServerPreset, t: Messages) {
  const texts: Record<string, string> = t.display.mcpServerPresets;
  return Object.hasOwn(texts, preset.name)
    ? texts[preset.name]
    : preset.description;
}

// A server's description as shown. A server added from a preset whose
// description is still the preset's shows it in the UI language; the stored
// text, which the agent reads, stays as it is.
export function mcpServerDescription(server: McpServerConfig, t: Messages) {
  const preset = findMcpServerPreset(server.id);
  return preset && server.description === preset.description
    ? mcpPresetDescription(preset, t)
    : server.description;
}
