// Stored settings every shot starts from: light theme, default pink accent.
export const BASE_PREFERENCES = {
  colorScheme: "light",
  accentColor: "pink",
  autoRetry: false,
  maxToolSteps: 20,
};

const model = (provider, label, name) => ({
  id: `${provider}:${name}`,
  name,
  displayName: `${label} / ${name}`,
});

// Placeholder keys: the options page masks them and nothing is ever sent.
const PROVIDERS = {
  openai: {
    id: "openai",
    type: "openai-responses",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-demo-0000000000000000000000000000",
    consent: { host: "api.openai.com", grantedAt: 1767225600000 },
    models: [
      model("openai", "OpenAI", "gpt-5"),
      model("openai", "OpenAI", "gpt-5-mini"),
    ],
  },
  anthropic: {
    id: "anthropic",
    type: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "sk-ant-demo-000000000000000000000000",
    consent: { host: "api.anthropic.com", grantedAt: 1767225600000 },
    models: [
      model("anthropic", "Anthropic", "claude-sonnet-4-5"),
      model("anthropic", "Anthropic", "claude-opus-4-1"),
    ],
  },
};

// A custom agent next to the built-in ones, in the locale's words.
const researchAgent = (research) => ({
  id: "research",
  name: research.name,
  description: research.description,
  icon: "search",
  prompt: research.prompt,
  toolGroups: ["pages", "web", "skills", "history", "subAgents"],
  modelId: "anthropic:claude-sonnet-4-5",
  workspace: true,
  createdAt: 1767225600000,
  updatedAt: 1767225600000,
});

// Seeds the settings shots through the options page itself, then reloads it.
export async function seedOptions(page, demo) {
  await page.call(
    async (values) => {
      await chrome.storage.local.set({
        provider: values.providers,
        agents: [values.agent],
        language: values.locale,
        preferences: { ...values.preferences, selectedModelId: "openai:gpt-5" },
        "skill-settings": {
          "builtin-local-execution-bridge-setup": { invoke: "manual" },
        },
      });
    },
    {
      providers: PROVIDERS,
      agent: researchAgent(demo.research),
      locale: demo.locale,
      preferences: BASE_PREFERENCES,
    },
  );
  await page.send("Page.reload");
}
